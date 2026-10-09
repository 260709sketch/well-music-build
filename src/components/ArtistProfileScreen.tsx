import React, { useMemo, useState } from "react";
import SFSymbol from '@/components/SFSymbol'
import FastImage from 'react-native-fast-image'
import {
  ActivityIndicator,
  Dimensions,
  Linking,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

const { width: SCREEN_W } = Dimensions.get("window");
const ARTWORK = Math.min((SCREEN_W - 52) / 3, 142);

export type ArtistSong = {
  id: string;
  title: string;
  subtitle?: string;
  artwork?: string;
  duration?: string;
  songmid?: string;
  platform?: string;
  source?: string;
  originalId?: string | number;
  album?: string;
  year?: string;
};

export type ArtistAlbum = {
  id: string;
  title: string;
  subtitle?: string;
  artwork: string;
};

export type ArtistProfile = {
  id: string;
  name: string;
  genre?: string;
  bio?: string;
  heroImage?: string;
  avatar?: string;
  songs?: ArtistSong[];
  albums?: ArtistAlbum[];
  eps?: ArtistAlbum[];
  compilations?: ArtistAlbum[];
  playlists?: ArtistAlbum[];
  videos?: ArtistAlbum[];
};

type Props = {
  artist: ArtistProfile;
  loading?: boolean;
  onBack?: () => void;
  onPlaySong?: (song: ArtistSong) => void;
  onPlayAll?: (songs: ArtistSong[]) => void;
  onMore?: (song: ArtistSong) => void;
  onOpenAlbum?: (album: ArtistAlbum) => void;
  onOpenPlaylist?: (playlist: ArtistAlbum) => void;
  onOpenVideo?: (video: ArtistAlbum) => void;
};

const FALLBACK =
  "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/placeholder/artist/1000x1000bb.jpg";

function SectionTitle({ title, onMore }: { title: string; onMore?: () => void }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {onMore ? (
        <Pressable hitSlop={10} onPress={onMore}>
          <Text style={styles.more}>查看全部</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function AlbumCard({
  item,
  onPress,
}: {
  item: ArtistAlbum;
  onPress?: () => void;
}) {
  return (
    <Pressable style={styles.albumCard} onPress={onPress}>
      <FastImage source={{ uri: item.artwork || FALLBACK }} style={styles.albumArt} priority={FastImage.priority.low} />
      <Text numberOfLines={1} style={styles.albumTitle}>
        {item.title}
      </Text>
      <Text numberOfLines={1} style={styles.albumSub}>
        {item.subtitle || "专辑"}
      </Text>
    </Pressable>
  );
}

export default function ArtistProfileScreen({
  artist,
  loading = false,
  onBack,
  onPlaySong,
  onPlayAll,
  onMore,
  onOpenAlbum,
  onOpenPlaylist,
  onOpenVideo,
}: Props) {
  const [following, setFollowing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [visibleSongPages, setVisibleSongPages] = useState(1);
  // 显示全部专辑，不再限制数量
  const visibleAlbumCount = 9999;

  const songs = artist.songs || [];
  const albums = artist.albums || [];
  const eps = artist.eps || [];
  const compilations = artist.compilations || [];
  const playlists = artist.playlists || [];
  const videos = artist.videos || [];

  const visibleBio = useMemo(() => {
    const text = artist.bio || "暂无艺人简介";
    if (expanded || text.length <= 130) return text;
    return `${text.slice(0, 130)}…`;
  }, [artist.bio, expanded]);

  if (loading) {
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator size="large" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        bounces
      >
        {/* Apple Music 风格顶部沉浸式艺人区域 */}
        <View style={styles.hero}>
          <FastImage
            source={{ uri: artist.heroImage || artist.avatar || FALLBACK }}
            style={styles.heroImage}
            blurRadius={0}
          />
          <View style={styles.heroShade} />
          <View style={styles.nav}>
            <Pressable style={styles.navButton} onPress={onBack}>
              <SFSymbol systemName="chevron.left" size={28} color="#ffffff" />
            </Pressable>
            <Pressable
              style={styles.navButton}
              onPress={() => {
                const url = `https://music.apple.com/cn/artist/${encodeURIComponent(
                  artist.name
                )}`;
                Linking.openURL(url).catch(() => {});
              }}
            >
              <SFSymbol systemName="ellipsis" size={23} color="#ffffff" />
            </Pressable>
          </View>

          <View style={styles.heroBottom}>
            <FastImage
              source={{ uri: artist.avatar || artist.heroImage || FALLBACK }}
              style={styles.avatar}
            />
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={styles.artistName}>{artist.name}</Text>
              <Pressable
                style={styles.floatingPlayButton}
                onPress={() => onPlayAll?.(songs)}
                disabled={!songs.length}
              >
                <Ionicons name="play" size={24} color="#fff" style={{ marginLeft: 3 }} />
              </Pressable>
            </View>
            {!!artist.genre && <Text style={styles.genre}>{artist.genre}</Text>}
          </View>
        </View>

        <View style={styles.body}>
          <View style={styles.actionRow}>
            <Pressable
              style={styles.playButton}
              onPress={() => onPlayAll?.(songs)}
              disabled={!songs.length}
            >
              <SFSymbol systemName="play.fill" size={20} color="#ffffff" />
              <Text style={styles.playText}>播放</Text>
            </Pressable>

            <Pressable
              style={[
                styles.followButton,
                following && styles.followingButton,
              ]}
              onPress={() => setFollowing((v) => !v)}
            >
              <SFSymbol systemName={following ? "checkmark" : "add"} size={20} color="#111" />
              <Text style={styles.followText}>
                {following ? "已关注" : "关注"}
              </Text>
            </Pressable>
          </View>

          {/* 热门歌曲 */}
          {songs.length > 0 && (
            <View style={styles.section}>
              <SectionTitle title="歌曲排行" />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                snapToInterval={SCREEN_W - 40}
                snapToAlignment="start"
                decelerationRate="fast"
                disableIntervalMomentum={true}
                scrollEventThrottle={100}
                onScroll={(e) => {
                  const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent
                  if (contentSize.width > 0 && contentOffset.x + layoutMeasurement.width >= contentSize.width - 50) {
                    setVisibleSongPages((prev) => Math.min(prev + 1, Math.ceil(songs.length / 5)))
                  }
                }}
              >
                {(() => {
                  const pages: ArtistSong[][] = []
                  for (let i = 0; i < songs.length; i += 5) {
                    pages.push(songs.slice(i, i + 5))
                  }
                  return pages.slice(0, visibleSongPages).map((page, pageIndex) => (
                    <View key={pageIndex} style={{ width: SCREEN_W - 40, flexDirection: 'column' }}>
                      {page.map((song, index) => {
                        const globalIndex = pageIndex * 5 + index
                        return (
                          <Pressable
                            key={song.id}
                            style={styles.songRow}
                            onPress={() => onPlaySong?.(song)}
                          >
                            <Text style={styles.rank}>{globalIndex + 1}</Text>
                            <FastImage
                              source={{ uri: song.artwork || artist.avatar || FALLBACK }}
                              style={styles.songArt}
                              priority={FastImage.priority.low}
                            />
                            <View style={styles.songInfo}>
                              <Text numberOfLines={1} style={styles.songTitle}>
                                {song.title}
                              </Text>
                              <Text numberOfLines={1} style={styles.songSub}>
                                {song.subtitle || artist.name}{song.year ? `  ${song.year}` : (song.album ? `  ${song.album}` : '')}
                              </Text>
                            </View>
                            <Text style={styles.duration}>{song.duration || ""}</Text>
                            <Pressable
                              hitSlop={10}
                              onPress={() => onMore?.(song)}
                            >
                              <SFSymbol systemName="ellipsis" size={20} color="#9a9a9f" />
                            </Pressable>
                          </Pressable>
                        )
                      })}
                    </View>
                  ))
                })()}
              </ScrollView>
            </View>
          )}

          {albums.length > 0 && (
            <View style={styles.section}>
              <SectionTitle title="专辑" onMore={() => {}} />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.horizontal}
              >
                {albums.map((album) => (
                  <AlbumCard
                    key={album.id}
                    item={album}
                    onPress={() => onOpenAlbum?.(album)}
                  />
                ))}
              </ScrollView>
            </View>
          )}

          {videos.length > 0 && (
            <View style={styles.section}>
              <SectionTitle title="音乐视频" />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.horizontal}
              >
                {videos.map((video) => (
                  <Pressable
                    key={video.id}
                    style={styles.videoCard}
                    onPress={() => onOpenVideo?.(video)}
                  >
                    <FastImage
                      source={{ uri: video.artwork || FALLBACK }}
                      style={styles.videoArt}
                    />
                    <View style={styles.videoPlay}>
                      <SFSymbol systemName="play.fill" size={18} color="#ffffff" />
                    </View>
                    <Text numberOfLines={1} style={styles.albumTitle}>
                      {video.title}
                    </Text>
                    <Text numberOfLines={1} style={styles.albumSub}>
                      {video.subtitle || "音乐视频"}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}

          {playlists.length > 0 && (
            <View style={styles.section}>
              <SectionTitle title="艺人歌单" />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.horizontal}
              >
                {playlists.map((item) => (
                  <AlbumCard
                    key={item.id}
                    item={item}
                    onPress={() => onOpenPlaylist?.(item)}
                  />
                ))}
              </ScrollView>
            </View>
          )}

          {eps.length > 0 && (
            <View style={styles.section}>
              <SectionTitle title="单曲与 EP" />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.horizontal}
              >
                {eps.map((item) => (
                  <AlbumCard key={item.id} item={item} onPress={() => onOpenAlbum?.(item)} />
                ))}
              </ScrollView>
            </View>
          )}

          {compilations.length > 0 && (
            <View style={styles.section}>
              <SectionTitle title="合辑" />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.horizontal}
              >
                {compilations.map((item) => (
                  <AlbumCard key={item.id} item={item} onPress={() => onOpenAlbum?.(item)} />
                ))}
              </ScrollView>
            </View>
          )}

          {/* 简介 */}
          <View style={styles.section}>
            <SectionTitle title="简介" />
            <Text style={styles.bio}>{visibleBio}</Text>
            {!!artist.bio && artist.bio.length > 130 && (
              <Pressable onPress={() => setExpanded((v) => !v)}>
                <Text style={styles.moreBio}>{expanded ? "收起" : "更多"}</Text>
              </Pressable>
            )}
          </View>

          <View style={styles.bottomSpace} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fff" },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  content: { paddingBottom: 30 },
  hero: {
    height: Math.min(SCREEN_W * 1.03, 510),
    backgroundColor: "#151515",
    overflow: "hidden",
  },
  heroImage: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  heroShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.22)",
  },
  nav: {
    position: "absolute",
    top: 10,
    left: 14,
    right: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    zIndex: 5,
  },
  navButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  heroBottom: {
    position: "absolute",
    left: 20,
    right: 20,
    bottom: 25,
    zIndex: 5,
  },
  avatar: {
    width: 86,
    height: 86,
    borderRadius: 43,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.5)",
  },
  artistName: {
    color: "#fff",
    fontSize: 35,
    lineHeight: 40,
    fontWeight: '500',
    letterSpacing: -1,
    flex: 1,
  },
  floatingPlayButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#FF3B30",
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 12,
  },
  genre: {
    color: "rgba(255,255,255,0.82)",
    marginTop: 5,
    fontSize: 14,
  },
  body: { paddingHorizontal: 8 },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 18,
  },
  playButton: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#111",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 7,
  },
  playText: { color: "#fff", fontSize: 16, fontWeight: '500' },
  followButton: {
    height: 48,
    paddingHorizontal: 20,
    borderRadius: 24,
    backgroundColor: "#f1f1f2",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 5,
  },
  followingButton: { backgroundColor: "#e5e5e7" },
  followText: { color: "#111", fontSize: 15, fontWeight: '500' },
  section: { marginTop: 12, marginBottom: 13 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 25,
    lineHeight: 30,
    fontWeight: '500',
    color: "#111",
    letterSpacing: -0.6,
  },
  more: { color: "#8b8b90", fontSize: 14, fontWeight: '500' },
  songList: { gap: 1 },
  songRow: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 7,
  },
  rank: {
    width: 25,
    textAlign: "center",
    fontSize: 14,
    color: "#8b8b90",
    fontWeight: '500',
  },
  songArt: {
    width: 48,
    height: 48,
    borderRadius: 10,
    marginHorizontal: 9,
    backgroundColor: "#eee",
  },
  songInfo: { flex: 1, paddingRight: 8 },
  songTitle: { color: "#ececed", fontSize: 16, fontWeight: '500' },
  songSub: { color: "#8e8e93", fontSize: 13, marginTop: 2 },
  duration: { color: "#8e8e93", fontSize: 12, marginRight: 10 },
  horizontal: { paddingRight: 8, gap: 13 },
  albumCard: { width: ARTWORK },
  albumArt: {
    width: ARTWORK,
    height: ARTWORK,
    borderRadius: 7,
    backgroundColor: "#eee",
  },
  albumTitle: {
    color: "#111",
    fontSize: 14,
    fontWeight: '500',
    marginTop: 8,
  },
  albumSub: { color: "#8a8a8f", fontSize: 12, marginTop: 3 },
  videoCard: { width: ARTWORK * 1.42 },
  videoArt: {
    width: ARTWORK * 1.42,
    height: ARTWORK * 0.8,
    borderRadius: 7,
    backgroundColor: "#eee",
  },
  videoPlay: {
    position: "absolute",
    left: 9,
    bottom: ARTWORK * 0.8 - 37,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.68)",
  },
  bio: {
    color: "#55555a",
    fontSize: 15,
    lineHeight: 23,
  },
  moreBio: {
    color: "#77777c",
    fontSize: 14,
    fontWeight: '500',
    marginTop: 8,
  },
  bottomSpace: { height: 70 },
});
