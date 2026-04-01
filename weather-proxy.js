/**
 * weather-proxy.js
 * 代理服务：使用腾讯天气API获取全国各省会城市实时天气数据
 * 端口 8767  /api/weather  → 返回各省聚合数据
 * 端口 8767  /             → 返回 weather-map.html
 */
const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');

// 各省及省会城市（用于腾讯天气API）
const PROVINCE_CITIES = [
  { province: '北京',   city: '北京',   apiProvince: '北京市', apiCity: '北京市' },
  { province: '天津',   city: '天津',   apiProvince: '天津市', apiCity: '天津市' },
  { province: '上海',   city: '上海',   apiProvince: '上海市', apiCity: '上海市' },
  { province: '重庆',   city: '重庆',   apiProvince: '重庆市', apiCity: '重庆市' },
  { province: '河北',   city: '石家庄', apiProvince: '河北省', apiCity: '石家庄市' },
  { province: '山西',   city: '太原',   apiProvince: '山西省', apiCity: '太原市' },
  { province: '内蒙古', city: '呼和浩特', apiProvince: '内蒙古自治区', apiCity: '呼和浩特市' },
  { province: '辽宁',   city: '沈阳',   apiProvince: '辽宁省', apiCity: '沈阳市' },
  { province: '吉林',   city: '长春',   apiProvince: '吉林省', apiCity: '长春市' },
  { province: '黑龙江', city: '哈尔滨', apiProvince: '黑龙江省', apiCity: '哈尔滨市' },
  { province: '江苏',   city: '南京',   apiProvince: '江苏省', apiCity: '南京市' },
  { province: '浙江',   city: '杭州',   apiProvince: '浙江省', apiCity: '杭州市' },
  { province: '安徽',   city: '合肥',   apiProvince: '安徽省', apiCity: '合肥市' },
  { province: '福建',   city: '福州',   apiProvince: '福建省', apiCity: '福州市' },
  { province: '江西',   city: '南昌',   apiProvince: '江西省', apiCity: '南昌市' },
  { province: '山东',   city: '济南',   apiProvince: '山东省', apiCity: '济南市' },
  { province: '河南',   city: '郑州',   apiProvince: '河南省', apiCity: '郑州市' },
  { province: '湖北',   city: '武汉',   apiProvince: '湖北省', apiCity: '武汉市' },
  { province: '湖南',   city: '长沙',   apiProvince: '湖南省', apiCity: '长沙市' },
  { province: '广东',   city: '广州',   apiProvince: '广东省', apiCity: '广州市' },
  { province: '广西',   city: '南宁',   apiProvince: '广西壮族自治区', apiCity: '南宁市' },
  { province: '海南',   city: '海口',   apiProvince: '海南省', apiCity: '海口市' },
  { province: '四川',   city: '成都',   apiProvince: '四川省', apiCity: '成都市' },
  { province: '贵州',   city: '贵阳',   apiProvince: '贵州省', apiCity: '贵阳市' },
  { province: '云南',   city: '昆明',   apiProvince: '云南省', apiCity: '昆明市' },
  { province: '西藏',   city: '拉萨',   apiProvince: '西藏自治区', apiCity: '拉萨市' },
  { province: '陕西',   city: '西安',   apiProvince: '陕西省', apiCity: '西安市' },
  { province: '甘肃',   city: '兰州',   apiProvince: '甘肃省', apiCity: '兰州市' },
  { province: '青海',   city: '西宁',   apiProvince: '青海省', apiCity: '西宁市' },
  { province: '宁夏',   city: '银川',   apiProvince: '宁夏回族自治区', apiCity: '银川市' },
  { province: '新疆',   city: '乌鲁木齐', apiProvince: '新疆维吾尔自治区', apiCity: '乌鲁木齐市' },
  { province: '台湾',   city: '台北',   apiProvince: '台湾省', apiCity: '台北市' },
  { province: '香港',   city: '香港',   apiProvince: '香港特别行政区', apiCity: '香港' },
  { province: '澳门',   city: '澳门',   apiProvince: '澳门特别行政区', apiCity: '澳门' },
];

// 腾讯天气API获取单个城市天气
function fetchTencentWeather(apiProvince, apiCity) {
  return new Promise((resolve) => {
    const encodedProvince = encodeURIComponent(apiProvince);
    const encodedCity = encodeURIComponent(apiCity);
    const url = `https://wis.qq.com/weather/common?source=pc&weather_type=observe&province=${encodedProvince}&city=${encodedCity}`;
    
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Referer': 'https://tianqi.qq.com/'
      },
      timeout: 10000
    }, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', d => raw += d);
      res.on('end', () => {
        try {
          const json = JSON.parse(raw);
          if (json.status === 200 && json.data && json.data.observe) {
            resolve({ ok: true, data: json.data.observe });
          } else {
            resolve({ ok: false, error: json.message || 'Invalid response' });
          }
        } catch(e) {
          resolve({ ok: false, error: e.message });
        }
      });
    });
    req.on('error', (e) => resolve({ ok: false, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
  });
}

// 备用数据（当API不可用时）
function getFallbackData(province) {
  const FALLBACK = {
    '北京':{temp:12,humid:45,weather:'晴',wind:'北风3级'},'天津':{temp:12,humid:48,weather:'多云',wind:'东北风2级'},
    '上海':{temp:18,humid:79,weather:'小雨',wind:'东南风3级'},'重庆':{temp:20,humid:74,weather:'阴',wind:'微风'},
    '河北':{temp:11,humid:50,weather:'晴',wind:'北风2级'},'山西':{temp:10,humid:48,weather:'晴',wind:'西北风2级'},
    '内蒙古':{temp:6,humid:36,weather:'晴',wind:'北风4级'},'辽宁':{temp:8,humid:56,weather:'多云',wind:'北风3级'},
    '吉林':{temp:5,humid:54,weather:'晴',wind:'西北风3级'},'黑龙江':{temp:4,humid:52,weather:'晴',wind:'北风3级'},
    '江苏':{temp:17,humid:76,weather:'小雨',wind:'东风2级'},'浙江':{temp:20,humid:82,weather:'阵雨',wind:'东南风3级'},
    '安徽':{temp:18,humid:75,weather:'阴',wind:'东风2级'},'福建':{temp:25,humid:85,weather:'多云',wind:'东南风2级'},
    '江西':{temp:22,humid:82,weather:'小雨',wind:'南风2级'},'山东':{temp:14,humid:62,weather:'晴',wind:'北风3级'},
    '河南':{temp:16,humid:65,weather:'多云',wind:'东北风2级'},'湖北':{temp:19,humid:74,weather:'阴',wind:'东风2级'},
    '湖南':{temp:21,humid:80,weather:'小雨',wind:'南风2级'},'广东':{temp:27,humid:91,weather:'阵雨',wind:'东南风2级'},
    '广西':{temp:26,humid:88,weather:'多云',wind:'南风2级'},'海南':{temp:32,humid:86,weather:'晴',wind:'南风3级'},
    '四川':{temp:19,humid:72,weather:'阴',wind:'微风'},'贵州':{temp:18,humid:78,weather:'小雨',wind:'东风2级'},
    '云南':{temp:20,humid:74,weather:'晴',wind:'西南风2级'},'西藏':{temp:-2,humid:30,weather:'晴',wind:'西风3级'},
    '陕西':{temp:13,humid:54,weather:'多云',wind:'北风2级'},'甘肃':{temp:8,humid:38,weather:'晴',wind:'西北风3级'},
    '青海':{temp:2,humid:35,weather:'晴',wind:'西风3级'},'宁夏':{temp:9,humid:40,weather:'晴',wind:'北风3级'},
    '新疆':{temp:10,humid:28,weather:'晴',wind:'北风4级'},'台湾':{temp:26,humid:84,weather:'多云',wind:'东风3级'},
    '香港':{temp:28,humid:89,weather:'多云',wind:'东南风2级'},'澳门':{temp:28,humid:88,weather:'多云',wind:'东南风2级'},
  };
  const data = FALLBACK[province] || {temp:15,humid:60,weather:'多云',wind:'微风'};
  return {...data, time: new Date().toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit' })};
}

// 获取所有省份天气（串行请求，避免被封）
async function fetchAllWeather() {
  const results = [];
  let successCount = 0;
  
  for (const p of PROVINCE_CITIES) {
    try {
      const result = await fetchTencentWeather(p.apiProvince, p.apiCity);
      if (result.ok) {
        const obs = result.data;
        results.push({
          province: p.province,
          city: p.city,
          temp: parseFloat(obs.degree),
          humid: parseInt(obs.humidity),
          weather: obs.weather,
          wind: (obs.wind_direction_name || '') + (obs.wind_power ? obs.wind_power + '级' : ''),
          time: obs.update_time ? obs.update_time.slice(8, 10) + ':' + obs.update_time.slice(10, 12) : new Date().toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
          isFallback: false
        });
        successCount++;
      } else {
        // 使用备用数据
        const fallback = getFallbackData(p.province);
        results.push({
          province: p.province,
          city: p.city,
          ...fallback,
          isFallback: true
        });
      }
      // 添加延迟避免请求过快
      await new Promise(r => setTimeout(r, 200));
    } catch(e) {
      const fallback = getFallbackData(p.province);
      results.push({
        province: p.province,
        city: p.city,
        ...fallback,
        isFallback: true
      });
    }
  }
  
  console.log(`[proxy] fetched ${successCount}/${PROVINCE_CITIES.length} provinces from Tencent Weather`);
  return results;
}

// 内存缓存（5分钟）
let cache = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000;

async function getWeatherData() {
  const now = Date.now();
  if (cache && now - cacheTime < CACHE_TTL) return cache;
  
  console.log('[proxy] fetching from Tencent Weather API ...');
  cache = await fetchAllWeather();
  cacheTime = Date.now();
  return cache;
}

// HTTP 服务
const server = http.createServer(async (req, res) => {
  const urlPath = req.url.split('?')[0];

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (urlPath === '/api/weather') {
    try {
      const data = await getWeatherData();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, data, fetchedAt: new Date(cacheTime).toISOString() }));
    } catch(e) {
      res.writeHead(500); res.end(JSON.stringify({ ok: false, error: e.message }));
    }
    return;
  }

  // 直接服务 weather-map.html
  const htmlFile = path.join(__dirname, 'weather-map.html');
  fs.readFile(htmlFile, (err, content) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(content);
  });
});

const PORT = 8767;
server.listen(PORT, () => {
  console.log(`[proxy] server running at http://localhost:${PORT}`);
  console.log(`[proxy] weather API: http://localhost:${PORT}/api/weather`);
  console.log(`[proxy] using Tencent Weather API`);
});
