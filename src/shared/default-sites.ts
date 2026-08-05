export interface DefaultReadingSite {
  id: string
  name: string
  shortName: string
  description: string
  url: string
  accent: string
  surface: string
}

export const DEFAULT_READING_SITES: readonly DefaultReadingSite[] = [
  {
    id: 'weread',
    name: '微信读书',
    shortName: '微',
    description: '书架与在线阅读',
    url: 'https://weread.qq.com/',
    accent: '#187b52',
    surface: '#e1f2e9'
  },
  {
    id: 'douyin',
    name: '抖音',
    shortName: '抖',
    description: '短视频与直播',
    url: 'https://www.douyin.com/',
    accent: '#1e1d25',
    surface: '#e9e8ed'
  },
  {
    id: 'bilibili',
    name: '哔哩哔哩',
    shortName: '哔',
    description: '视频与知识内容',
    url: 'https://www.bilibili.com/',
    accent: '#1489a8',
    surface: '#e0f2f6'
  },
  {
    id: 'xiaohongshu',
    name: '小红书',
    shortName: '红',
    description: '生活兴趣社区',
    url: 'https://www.xiaohongshu.com/explore',
    accent: '#bc3d40',
    surface: '#f7e5e5'
  },
  {
    id: 'fenbi',
    name: '粉笔网',
    shortName: '粉',
    description: '公考与职业刷题',
    url: 'https://www.fenbi.com/',
    accent: '#27866d',
    surface: '#e1f1ec'
  },
  {
    id: 'fanqie',
    name: '番茄小说',
    shortName: '番',
    description: '网络小说阅读',
    url: 'https://fanqienovel.com/',
    accent: '#d85035',
    surface: '#f8e7e1'
  },
  {
    id: 'jjwxc',
    name: '晋江文学城',
    shortName: '晋',
    description: '原创网络文学',
    url: 'https://www.jjwxc.net/',
    accent: '#77743e',
    surface: '#efefdf'
  }
]
