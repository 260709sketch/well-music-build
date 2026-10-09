// WellMusicUserApi.mm
// 移植自 lx-music-mobile iOS（LX-Y-Music-IOS）的 UserApiModule 实现
// 通过 iOS 内置 JavaScriptCore 运行 lx 音源脚本，暴露给 React Native JS 层调用
#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>
#import <React/RCTLog.h>
#import <JavaScriptCore/JavaScriptCore.h>
#import <CommonCrypto/CommonCryptor.h>
#import <CommonCrypto/CommonDigest.h>
#import <Security/Security.h>
#import <UIKit/UIKit.h>
#import <math.h>

// MARK: - 底层辅助函数

static NSData *LXBase64Decode(NSString *value) {
  if (value == nil) return [NSData data];
  return [[NSData alloc] initWithBase64EncodedString:value options:NSDataBase64DecodingIgnoreUnknownCharacters] ?: [NSData data];
}

static NSString *LXBase64Encode(NSData *value) {
  if (value == nil || value.length == 0) return @"";
  return [value base64EncodedStringWithOptions:0];
}

static NSData *LXDERLength(NSUInteger length) {
  if (length < 0x80) {
    uint8_t value = (uint8_t)length;
    return [NSData dataWithBytes:&value length:1];
  }
  uint8_t lengthBytes[sizeof(NSUInteger)] = { 0 };
  NSUInteger index = sizeof(NSUInteger);
  NSUInteger value = length;
  while (value > 0) {
    index -= 1;
    lengthBytes[index] = (uint8_t)(value & 0xFF);
    value >>= 8;
  }
  uint8_t prefix = (uint8_t)(0x80 | (sizeof(NSUInteger) - index));
  NSMutableData *data = [NSMutableData dataWithBytes:&prefix length:1];
  [data appendBytes:&lengthBytes[index] length:sizeof(NSUInteger) - index];
  return data;
}

static NSData *LXDERWrap(uint8_t tag, NSData *value) {
  NSMutableData *data = [NSMutableData dataWithBytes:&tag length:1];
  [data appendData:LXDERLength(value.length)];
  [data appendData:value];
  return data;
}

static BOOL LXReadASN1Length(NSData *data, NSUInteger *index, NSUInteger *length) {
  if (*index >= data.length) return NO;
  const uint8_t *bytes = (const uint8_t *)data.bytes;
  uint8_t byte = bytes[*index];
  *index += 1;
  if ((byte & 0x80) == 0) {
    *length = byte;
    return *index + *length <= data.length;
  }
  NSUInteger byteCount = byte & 0x7F;
  if (byteCount == 0 || *index + byteCount > data.length) return NO;
  NSUInteger value = 0;
  for (NSUInteger i = 0; i < byteCount; i++) {
    value = (value << 8) | bytes[*index + i];
  }
  *index += byteCount;
  *length = value;
  return *index + *length <= data.length;
}

static NSData *LXRSAPublicKeyAlgorithmIdentifier(void) {
  static const uint8_t bytes[] = {
    0x30, 0x0D,
    0x06, 0x09,
    0x2A, 0x86, 0x48, 0x86, 0xF7, 0x0D, 0x01, 0x01, 0x01,
    0x05, 0x00,
  };
  return [NSData dataWithBytes:bytes length:sizeof(bytes)];
}

static NSData *LXWrapRSAPublicKey(NSData *publicKeyData) {
  NSMutableData *bitStringValue = [NSMutableData dataWithBytes:"\x00" length:1];
  [bitStringValue appendData:publicKeyData];
  NSMutableData *sequence = [NSMutableData dataWithData:LXRSAPublicKeyAlgorithmIdentifier()];
  [sequence appendData:LXDERWrap(0x03, bitStringValue)];
  return LXDERWrap(0x30, sequence);
}

static NSData *LXWrapRSAPrivateKey(NSData *privateKeyData) {
  static const uint8_t versionBytes[] = { 0x02, 0x01, 0x00 };
  NSData *version = [NSData dataWithBytes:versionBytes length:sizeof(versionBytes)];
  NSMutableData *sequence = [NSMutableData dataWithData:version];
  [sequence appendData:LXRSAPublicKeyAlgorithmIdentifier()];
  [sequence appendData:LXDERWrap(0x04, privateKeyData)];
  return LXDERWrap(0x30, sequence);
}

static NSData *LXStripPublicKeyHeader(NSData *data) {
  if (data.length < 1) return data;
  const uint8_t *bytes = (const uint8_t *)data.bytes;
  NSUInteger index = 0;
  NSUInteger length = 0;
  if (bytes[index] != 0x30) return data;
  index += 1;
  if (!LXReadASN1Length(data, &index, &length)) return data;
  if (index >= data.length) return data;
  if (bytes[index] == 0x02) return data;
  if (bytes[index] != 0x30) return data;
  index += 1;
  if (!LXReadASN1Length(data, &index, &length)) return data;
  index += length;
  if (index >= data.length || bytes[index] != 0x03) return data;
  index += 1;
  if (!LXReadASN1Length(data, &index, &length)) return data;
  if (index >= data.length || bytes[index] != 0x00) return data;
  index += 1;
  if (index > data.length) return data;
  return [data subdataWithRange:NSMakeRange(index, data.length - index)];
}

static NSData *LXStripPrivateKeyHeader(NSData *data) {
  if (data.length < 1) return data;
  const uint8_t *bytes = (const uint8_t *)data.bytes;
  NSUInteger index = 0;
  NSUInteger length = 0;
  if (bytes[index] != 0x30) return data;
  index += 1;
  if (!LXReadASN1Length(data, &index, &length)) return data;
  if (index >= data.length || bytes[index] != 0x02) return data;
  index += 1;
  if (!LXReadASN1Length(data, &index, &length)) return data;
  index += length;
  if (index >= data.length) return data;
  if (bytes[index] == 0x02) return data;
  if (bytes[index] != 0x30) return data;
  index += 1;
  if (!LXReadASN1Length(data, &index, &length)) return data;
  index += length;
  if (index >= data.length || bytes[index] != 0x04) return data;
  index += 1;
  if (!LXReadASN1Length(data, &index, &length)) return data;
  if (index + length > data.length) return data;
  return [data subdataWithRange:NSMakeRange(index, length)];
}

static NSError *LXError(NSString *code, NSString *message) {
  return [NSError errorWithDomain:@"CryptoModule" code:0 userInfo:@{
    NSLocalizedDescriptionKey: message,
    @"code": code,
  }];
}

static SecKeyRef LXCreateRSAKey(NSData *data, CFTypeRef keyClass, NSError **error) {
  NSData *normalizedData = CFEqual(keyClass, kSecAttrKeyClassPublic)
    ? LXStripPublicKeyHeader(data)
    : LXStripPrivateKeyHeader(data);
  NSDictionary *attributes = @{
    (__bridge id)kSecAttrKeyType: (__bridge id)kSecAttrKeyTypeRSA,
    (__bridge id)kSecAttrKeyClass: (__bridge id)keyClass,
  };
  CFErrorRef cfError = NULL;
  SecKeyRef key = SecKeyCreateWithData((__bridge CFDataRef)normalizedData, (__bridge CFDictionaryRef)attributes, &cfError);
  if (cfError != NULL) {
    if (error != NULL) *error = CFBridgingRelease(cfError);
    else CFRelease(cfError);
  }
  return key;
}

static SecKeyAlgorithm LXRSAAlgorithm(NSString *padding) {
  if ([padding isEqualToString:@"RSA/ECB/OAEPWithSHA1AndMGF1Padding"]) {
    return kSecKeyAlgorithmRSAEncryptionOAEPSHA1;
  }
  return kSecKeyAlgorithmRSAEncryptionRaw;
}

static NSString *LXRSAEncrypt(NSString *decryptedBase64, NSString *publicKeyBase64, NSString *padding, NSError **error) {
  SecKeyRef key = LXCreateRSAKey(LXBase64Decode(publicKeyBase64), kSecAttrKeyClassPublic, error);
  if (key == NULL) return nil;
  NSData *plainData = LXBase64Decode(decryptedBase64);
  SecKeyAlgorithm algorithm = LXRSAAlgorithm(padding);
  if (!SecKeyIsAlgorithmSupported(key, kSecKeyOperationTypeEncrypt, algorithm)) {
    if (error != NULL) *error = LXError(@"rsa_encrypt", @"Unsupported RSA encryption algorithm");
    CFRelease(key);
    return nil;
  }
  CFErrorRef cfError = NULL;
  NSData *encryptedData = (__bridge_transfer NSData *)SecKeyCreateEncryptedData(key, algorithm, (__bridge CFDataRef)plainData, &cfError);
  CFRelease(key);
  if (encryptedData == nil) {
    if (error != NULL && cfError != NULL) *error = CFBridgingRelease(cfError);
    return nil;
  }
  return LXBase64Encode(encryptedData);
}

static NSString *LXAES(NSString *dataBase64, NSString *keyBase64, NSString *ivBase64, NSString *mode, CCOperation operation, NSError **error) {
  NSData *data = LXBase64Decode(dataBase64);
  NSData *key = LXBase64Decode(keyBase64);
  NSData *iv = LXBase64Decode(ivBase64);
  if (key.length == 0) {
    if (error != NULL) *error = LXError(@"aes_key", @"Missing AES key");
    return nil;
  }
  BOOL isCBC = [mode isEqualToString:@"AES/CBC/PKCS7Padding"];
  BOOL usesAndroidCompatibleECBPadding = [mode isEqualToString:@"AES"];
  CCOptions options = 0;
  if (isCBC || usesAndroidCompatibleECBPadding) options |= kCCOptionPKCS7Padding;
  if (!isCBC) options |= kCCOptionECBMode;
  char ivBuffer[kCCBlockSizeAES128] = { 0 };
  if (isCBC && iv.length > 0) {
    [iv getBytes:ivBuffer length:MIN(iv.length, sizeof(ivBuffer))];
  }
  size_t outputLength = data.length + kCCBlockSizeAES128;
  NSMutableData *output = [NSMutableData dataWithLength:outputLength];
  size_t moved = 0;
  CCCryptorStatus status = CCCrypt(
    operation,
    kCCAlgorithmAES,
    options,
    key.bytes,
    key.length,
    isCBC ? ivBuffer : NULL,
    data.bytes,
    data.length,
    output.mutableBytes,
    output.length,
    &moved
  );
  if (status != kCCSuccess) {
    if (error != NULL) *error = LXError(@"aes", [NSString stringWithFormat:@"AES operation failed: %d", status]);
    return nil;
  }
  output.length = moved;
  if (operation == kCCEncrypt) return LXBase64Encode(output);
  NSString *result = [[NSString alloc] initWithData:output encoding:NSUTF8StringEncoding];
  return result ?: @"";
}

static NSString *LXJSONString(id value) {
  if (value == nil || value == (id)kCFNull) return nil;
  if ([value isKindOfClass:[NSString class]]) return value;
  NSData *data = [NSJSONSerialization dataWithJSONObject:value options:NSJSONWritingFragmentsAllowed error:nil];
  if (!data) return nil;
  return [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
}

static NSString *LXJoinJSArguments(NSArray<JSValue *> *arguments) {
  NSMutableArray<NSString *> *parts = [NSMutableArray arrayWithCapacity:arguments.count];
  for (JSValue *value in arguments) {
    if (value.isUndefined || value.isNull) {
      [parts addObject:@"null"];
      continue;
    }
    NSString *text = value.toString;
    [parts addObject:text ?: @"null"];
  }
  return [parts componentsJoinedByString:@" "];
}

// MARK: - UserApiModule

@interface UserApiModule : RCTEventEmitter<RCTBridgeModule>
@property (nonatomic, strong) JSContext *jsContext;
@property (nonatomic, strong) dispatch_queue_t scriptQueue;
@property (nonatomic, copy) NSString *scriptKey;
@property (nonatomic, assign) BOOL initSent;
@property (nonatomic, assign) BOOL lastInitStatus;
@property (nonatomic, copy) NSString *lastInitErrorMessage;
@property (nonatomic, copy) NSString *lastInitDataString;
@property (nonatomic, assign) BOOL hasListeners;
@property (nonatomic, strong) NSDictionary *scriptInfo;
@property (nonatomic, copy) NSString *preloadScript;
@end

@implementation UserApiModule

RCT_EXPORT_MODULE();

+ (BOOL)requiresMainQueueSetup {
  return NO;
}

- (instancetype)init {
  self = [super init];
  if (self != nil) {
    _scriptQueue = dispatch_queue_create("cn.toside.music.mobile.userapi", DISPATCH_QUEUE_SERIAL);
  }
  return self;
}

- (NSArray<NSString *> *)supportedEvents {
  return @[ @"api-action" ];
}

- (void)startObserving {
  self.hasListeners = YES;
  // 如果 init 已经完成（成功或失败），补发一次 init 事件，
  // 避免因监听器注册晚于 init 完成导致 JS 侧收不到结果。
  if (self.initSent) {
    dispatch_async(dispatch_get_main_queue(), ^{
      @try {
        NSMutableDictionary *body = [NSMutableDictionary dictionaryWithObject:@"init" forKey:@"action"];
        if (self.lastInitDataString) body[@"data"] = self.lastInitDataString;
        if (self.lastInitErrorMessage) body[@"errorMessage"] = self.lastInitErrorMessage;
        [self sendEventWithName:@"api-action" body:body];
      } @catch (NSException *e) {
        NSLog(@"[UserApiModule] startObserving re-send init failed: %@", e.reason);
      }
    });
  }
}

- (void)stopObserving {
  self.hasListeners = NO;
}

- (void)emitLogWithType:(NSString *)type message:(NSString *)message {
  if (!self.hasListeners) return;
  dispatch_async(dispatch_get_main_queue(), ^{
    [self sendEventWithName:@"api-action" body:@{
      @"action": @"log",
      @"type": type ?: @"log",
      @"log": message ?: @"",
    }];
  });
}

- (void)emitAction:(NSString *)action dataString:(NSString *)dataString errorMessage:(NSString *)errorMessage {
  if (!self.hasListeners) return;
  NSMutableDictionary *body = [NSMutableDictionary dictionaryWithObject:action forKey:@"action"];
  if (dataString != nil) body[@"data"] = dataString;
  if (errorMessage != nil) body[@"errorMessage"] = errorMessage;
  dispatch_async(dispatch_get_main_queue(), ^{
    [self sendEventWithName:@"api-action" body:body];
  });
}

- (NSString *)loadPreloadScript {
  NSString *path = [[NSBundle mainBundle] pathForResource:@"user-api-preload" ofType:@"js"];
  if (!path.length) return nil;
  return [NSString stringWithContentsOfFile:path encoding:NSUTF8StringEncoding error:nil];
}

- (void)emitInitFailed:(NSString *)message {
  NSString *msg = message ?: @"Create JavaScript Env Failed";
  NSDictionary *data = @{
    @"info": [NSNull null],
    @"status": @NO,
    @"errorMessage": msg,
  };
  NSString *dataString = LXJSONString(data);
  // init 失败是关键事件，不检查 hasListeners，直接发送，
  // 避免因监听器注册时序问题导致 JS 侧永远不知道失败原因。
  // 发送失败（如 bridge 未就绪）时静默忽略，RCTEventEmitter 内部会处理。
  dispatch_async(dispatch_get_main_queue(), ^{
    @try {
      [self sendEventWithName:@"api-action" body:@{
        @"action": @"init",
        @"data": dataString ?: @"",
        @"errorMessage": msg,
      }];
    } @catch (NSException *e) {
      NSLog(@"[UserApiModule] emitInitFailed send event failed: %@", e.reason);
    }
  });
  [self emitLogWithType:@"error" message:msg];
  // 标记 init 已发送（失败），startObserving 时补发
  self.initSent = YES;
  self.lastInitStatus = NO;
  self.lastInitErrorMessage = msg;
  self.lastInitDataString = dataString;
}

- (void)destroyContext {
  self.jsContext = nil;
  self.scriptKey = nil;
  self.initSent = NO;
  self.lastInitStatus = NO;
  self.lastInitErrorMessage = nil;
  self.lastInitDataString = nil;
  self.scriptInfo = nil;
  self.preloadScript = nil;
}

- (void)callJSAction:(NSString *)action data:(id)data {
  if (self.jsContext == nil) return;
  JSValue *nativeCall = self.jsContext[@"__lx_native__"];
  if (nativeCall == nil || nativeCall.isUndefined) return;
  NSMutableArray *arguments = [NSMutableArray arrayWithObjects:self.scriptKey ?: @"", action ?: @"", nil];
  if (data != nil) {
    NSString *jsonString = [data isKindOfClass:[NSString class]] ? data : LXJSONString(data);
    if (jsonString != nil) [arguments addObject:jsonString];
  }
  [nativeCall callWithArguments:arguments];
}

- (BOOL)createJSEnv:(NSDictionary *)scriptInfo error:(NSString **)errorMessage {
  self.scriptKey = NSUUID.UUID.UUIDString;
  self.scriptInfo = scriptInfo;
  self.initSent = NO;
  JSContext *context = [[JSContext alloc] init];
  self.jsContext = context;

  __weak UserApiModule *weakSelf = self;
  __block NSString *lastException = nil;
  context.exceptionHandler = ^(JSContext *ctx, JSValue *exception) {
    ctx.exception = exception;
    lastException = exception.toString ?: @"Unknown JavaScript exception";
    [weakSelf emitLogWithType:@"error" message:[NSString stringWithFormat:@"Call script error: %@", lastException]];
  };

  context[@"globalThis"] = context.globalObject;
  context[@"window"] = context.globalObject;
  context[@"self"] = context.globalObject;
  context[@"global"] = context.globalObject;

  JSValue *console = [JSValue valueWithNewObjectInContext:context];
  console[@"log"] = ^{ [weakSelf emitLogWithType:@"log" message:LXJoinJSArguments([JSContext currentArguments])]; };
  console[@"info"] = ^{ [weakSelf emitLogWithType:@"info" message:LXJoinJSArguments([JSContext currentArguments])]; };
  console[@"warn"] = ^{ [weakSelf emitLogWithType:@"warn" message:LXJoinJSArguments([JSContext currentArguments])]; };
  console[@"error"] = ^{ [weakSelf emitLogWithType:@"error" message:LXJoinJSArguments([JSContext currentArguments])]; };
  context[@"console"] = console;

  context[@"__lx_native_call__"] = ^id(NSString *key, NSString *action, NSString *data) {
    if (![weakSelf.scriptKey isEqualToString:key]) return nil;
    if ([action isEqualToString:@"init"]) {
      if (weakSelf.initSent) return nil;
      weakSelf.initSent = YES;
      // 保存 init 结果，供 startObserving 补发使用
      weakSelf.lastInitStatus = YES;
      weakSelf.lastInitErrorMessage = nil;
      weakSelf.lastInitDataString = data;
    }
    [weakSelf emitAction:action dataString:data errorMessage:nil];
    return nil;
  };

  context[@"__lx_native_call__utils_str2b64"] = ^NSString *(NSString *input) {
    NSData *data = [input dataUsingEncoding:NSUTF8StringEncoding] ?: [NSData data];
    return [data base64EncodedStringWithOptions:0];
  };

  context[@"__lx_native_call__utils_b642buf"] = ^NSString *(NSString *input) {
    NSData *data = [[NSData alloc] initWithBase64EncodedString:input options:NSDataBase64DecodingIgnoreUnknownCharacters] ?: [NSData data];
    NSMutableArray<NSNumber *> *result = [NSMutableArray arrayWithCapacity:data.length];
    const unsigned char *bytes = (const unsigned char *)data.bytes;
    for (NSUInteger index = 0; index < data.length; index++) {
      [result addObject:@((NSInteger)bytes[index])];
    }
    return LXJSONString(result) ?: @"[]";
  };

  context[@"__lx_native_call__utils_str2md5"] = ^NSString *(NSString *input) {
    NSString *decoded = [input stringByRemovingPercentEncoding] ?: input ?: @"";
    NSData *data = [decoded dataUsingEncoding:NSUTF8StringEncoding] ?: [NSData data];
    unsigned char digest[CC_MD5_DIGEST_LENGTH];
    CC_MD5(data.bytes, (CC_LONG)data.length, digest);
    NSMutableString *hash = [NSMutableString stringWithCapacity:CC_MD5_DIGEST_LENGTH * 2];
    for (NSInteger i = 0; i < CC_MD5_DIGEST_LENGTH; i++) {
      [hash appendFormat:@"%02x", digest[i]];
    }
    return hash;
  };

  context[@"__lx_native_call__utils_aes_encrypt"] = ^NSString *(NSString *text, NSString *key, NSString *iv, NSString *mode) {
    return LXAES(text ?: @"", key ?: @"", iv ?: @"", mode ?: @"", kCCEncrypt, nil) ?: @"";
  };

  context[@"__lx_native_call__utils_rsa_encrypt"] = ^NSString *(NSString *text, NSString *key, NSString *padding) {
    return LXRSAEncrypt(text ?: @"", key ?: @"", padding ?: @"", nil) ?: @"";
  };

  context[@"__lx_native_call__set_timeout"] = ^id(NSNumber *identifier, NSNumber *timeout) {
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(MAX(timeout.doubleValue, 0) * NSEC_PER_MSEC)), weakSelf.scriptQueue, ^{
      [weakSelf callJSAction:@"__set_timeout__" data:identifier ?: @0];
    });
    return nil;
  };

  // 优先使用 JS 层内嵌传入的 preload（保证一定可用），回退到 main bundle 资源
  NSString *preloadScript = self.preloadScript;
  if (!preloadScript.length) preloadScript = [self loadPreloadScript];
  if (!preloadScript.length) {
    if (errorMessage != NULL) *errorMessage = @"create JavaScript Env failed";
    return NO;
  }

  [context evaluateScript:preloadScript];
  if (lastException.length) {
    if (errorMessage != NULL) *errorMessage = lastException;
    return NO;
  }

  JSValue *setup = context[@"lx_setup"];
  [setup callWithArguments:@[
    self.scriptKey ?: @"",
    scriptInfo[@"id"] ?: @"",
    scriptInfo[@"name"] ?: @"Unknown",
    scriptInfo[@"description"] ?: @"",
    scriptInfo[@"version"] ?: @"",
    scriptInfo[@"author"] ?: @"",
    scriptInfo[@"homepage"] ?: @"",
    scriptInfo[@"script"] ?: @"",
  ]];
  if (lastException.length) {
    if (errorMessage != NULL) *errorMessage = lastException;
    return NO;
  }
  return YES;
}

RCT_EXPORT_METHOD(loadScript:(NSDictionary *)data) {
  dispatch_async(self.scriptQueue, ^{
    [self destroyContext];
    self.preloadScript = data[@"preload"] ?: @"";
    NSString *errorMessage = nil;
    if (![self createJSEnv:data error:&errorMessage]) {
      [self emitInitFailed:errorMessage];
      return;
    }
    __weak UserApiModule *weakSelf = self;
    __block NSString *lastException = nil;
    self.jsContext.exceptionHandler = ^(JSContext *ctx, JSValue *exception) {
      ctx.exception = exception;
      lastException = exception.toString ?: @"Unknown JavaScript exception";
      [weakSelf emitLogWithType:@"error" message:[NSString stringWithFormat:@"Call script error: %@", lastException]];
    };
    [self.jsContext evaluateScript:data[@"script"] ?: @""];
    if (lastException.length) {
      [weakSelf callJSAction:@"__run_error__" data:nil];
      if (!weakSelf.initSent) {
        weakSelf.initSent = YES;
        [weakSelf emitInitFailed:lastException];
      }
    }
  });
}

RCT_EXPORT_METHOD(sendAction:(NSString *)action info:(NSString *)info) {
  dispatch_async(self.scriptQueue, ^{
    if (self.jsContext == nil) return;
    [self callJSAction:action data:info];
  });
}

RCT_EXPORT_METHOD(destroy) {
  dispatch_async(self.scriptQueue, ^{
    [self destroyContext];
  });
}

@end