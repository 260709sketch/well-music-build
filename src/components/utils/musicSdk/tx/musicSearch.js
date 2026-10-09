import { httpFetch } from '../../request'
import { formatPlayTime, sizeFormate } from '../../index'
import { formatSingerName } from '../utils'

export default {
  limit: 50,
  total: 0,
  page: 0,
  allPage: 1,
  successCode: 0,
  musicSearch(str, page, limit, retryNum = 0) {
    if (retryNum > 5) return Promise.reject(new Error('搜索失败'))
    const searchRequest = httpFetch('https://u.y.qq.com/cgi-bin/musicu.fcg', {
      method: 'post',
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        Referer: 'https://y.qq.com/',
        Origin: 'https://y.qq.com',
        Accept: 'application/json, text/plain, */*',
        'Content-Type': 'application/json;charset=utf-8',
      },
      body: {
        comm: {
          ct: 19,
          cv: '1859',
          v: '1859',
          os_ver: '17',
          phonetype: '0',
          devicelevel: '31',
          tmeAppID: 'qqmusic',
          nettype: 'NETWORK_WIFI',
        },
        req: {
          module: 'music.search.SearchCgiService',
          method: 'DoSearchForQQMusicDesktop',
          param: {
            query: str,
            search_type: 0,
            num_per_page: limit,
            page_num: page,
            nqc_flag: 0,
            grp: 1,
          },
        },
      },
    })
    return searchRequest.promise.then(({ body }) => {
      if (body.code != this.successCode || body.req.code != this.successCode) {
        if (retryNum < 2) {
          console.log('[QQ搜索] 主API失败，尝试备用API')
          return this.musicSearchBackup(str, page, limit, retryNum)
        }
        return this.musicSearch(str, page, limit, ++retryNum)
      }
      return body.req.data
    }).catch(() => {
      if (retryNum < 2) {
        console.log('[QQ搜索] 主API网络错误，尝试备用API')
        return this.musicSearchBackup(str, page, limit, retryNum)
      }
      return this.musicSearch(str, page, limit, ++retryNum)
    })
  },
  // 备用搜索API（旧版接口）
  musicSearchBackup(str, page, limit, retryNum = 0) {
    const searchRequest = httpFetch(`https://c.y.qq.com/soso/fcgi-bin/client_search_cp?ct=24&qqmusic_ver=1298&new_json=1&remoteplace=sizer.yqq.song_next&searchid=49252838123499591&t=0&aggr=1&cr=1&catZhida=1&lossless=0&flag_qc=0&p=${page}&n=${limit}&w=${encodeURIComponent(str)}&loginUin=0&hostUin=0&format=json&inCharset=utf8&outCharset=utf-8&notice=0&platform=yqq&needNewCode=0`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15',
        Referer: 'https://y.qq.com/',
      },
    })
    return searchRequest.promise.then(({ body }) => {
      if (body.code != 0) return this.musicSearch(str, page, limit, ++retryNum)
      const songList = body.data?.song?.list || []
      return {
        item_song: songList.map(item => ({
          id: item.id,
          mid: item.mid,
          name: item.name,
          title_extra: item.title_extra || '',
          singer: item.singer?.map(s => ({ name: s.name, mid: s.mid })) || [],
          album: item.album ? { name: item.album.name, mid: item.album.mid } : null,
          interval: item.interval,
          file: {
            media_mid: item.file?.media_mid || '',
            size_128mp3: item.file?.size_128mp3 || 0,
            size_320mp3: item.file?.size_320mp3 || 0,
            size_flac: item.file?.size_flac || 0,
            size_hires: item.file?.size_hires || 0,
          },
        })),
        meta: {
          estimate_sum: body.data?.song?.total || 0,
        },
      }
    }).catch(() => this.musicSearch(str, page, limit, ++retryNum))
  },
  handleResult(rawList) {
    const list = []
    rawList.forEach(item => {
      if (!item.file?.media_mid) return

      let types = []
      let _types = {}
      const file = item.file
      if (file.size_128mp3 != 0) {
        let size = sizeFormate(file.size_128mp3)
        types.push({ type: '128k', size })
        _types['128k'] = { size }
      }
      if (file.size_320mp3 !== 0) {
        let size = sizeFormate(file.size_320mp3)
        types.push({ type: '320k', size })
        _types['320k'] = { size }
      }
      if (file.size_flac !== 0) {
        let size = sizeFormate(file.size_flac)
        types.push({ type: 'flac', size })
        _types.flac = { size }
      }
      if (file.size_hires !== 0) {
        let size = sizeFormate(file.size_hires)
        types.push({ type: 'flac24bit', size })
        _types.flac24bit = { size }
      }
      let albumId = ''
      let albumName = ''
      if (item.album) {
        albumName = item.album.name
        albumId = item.album.mid
      }
      list.push({
        singer: formatSingerName(item.singer, 'name'),
        name: item.name + (item.title_extra ?? ''),
        albumName,
        albumId,
        source: 'tx',
        interval: formatPlayTime(item.interval),
        songId: item.id,
        albumMid: item.album?.mid ?? '',
        strMediaMid: item.file.media_mid,
        songmid: item.mid,
        img: (albumId === '' || albumId === '空')
          ? item.singer?.length ? `https://y.gtimg.cn/music/photo_new/T001R500x500M000${item.singer[0].mid}.jpg` : ''
          : `https://y.gtimg.cn/music/photo_new/T002R500x500M000${albumId}.jpg`,
        types,
        _types,
        typeUrl: {},
      })
    })
    return list
  },
  search(str, page = 1, limit) {
    if (limit == null) limit = this.limit
    return this.musicSearch(str, page, limit).then(({ body, meta }) => {
      let list = this.handleResult(body.item_song)
      this.total = meta.estimate_sum
      this.page = page
      this.allPage = Math.ceil(this.total / limit)
      return Promise.resolve({
        list,
        allPage: this.allPage,
        limit,
        total: this.total,
        source: 'tx',
      })
    })
  },
}
