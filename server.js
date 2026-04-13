const express = require('express');
const https = require('https');
const http = require('http');
const { parseStringPromise } = require('xml2js');
const path = require('path');

const app = express();
const PORT = 3000;

// 경쟁사 목록
const COMPETITORS = [
  { name: '녹십자의료재단', query: '녹십자의료재단' },
  { name: '씨젠의료재단', query: '씨젠의료재단' },
  { name: '서울의과학연구소', query: '서울의과학연구소' },
  { name: '이원의료재단', query: '이원의료재단' },
  { name: '신원의료재단', query: '신원의료재단' },
  { name: '유투바이오', query: '유투바이오' },
];

// 고정 키워드 목록
const KEYWORDS = [
  { name: '검체검사', query: '검체검사' },
  { name: '검체수탁', query: '검체수탁' },
  { name: '검체검사 위수탁 분리청구', query: '검체검사+위수탁+분리청구' },
];

// 정적 파일 서빙
app.use(express.static(path.join(__dirname, 'public')));

// Google News RSS 가져오기
function fetchRss(query) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=ko&gl=KR&ceid=KR:ko`;

  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // 리다이렉트 처리
        const redirectClient = res.headers.location.startsWith('https') ? https : http;
        redirectClient.get(res.headers.location, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res2) => {
          let data = '';
          res2.on('data', chunk => data += chunk);
          res2.on('end', () => resolve(data));
          res2.on('error', reject);
        }).on('error', reject);
        return;
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

// RSS XML 파싱
async function parseRss(xml) {
  const result = await parseStringPromise(xml, { explicitArray: false });
  const channel = result?.rss?.channel;
  if (!channel || !channel.item) return [];

  const items = Array.isArray(channel.item) ? channel.item : [channel.item];

  return items.map(item => {
    // description에서 HTML 태그 제거
    let desc = item.description || '';
    desc = desc.replace(/<[^>]*>/g, '').trim();

    return {
      title: (item.title || '').replace(/<[^>]*>/g, '').trim(),
      link: item.link || '',
      description: desc,
      pubDate: item.pubDate || '',
      source: item.source?._  || item.source || '',
    };
  });
}

// 기사를 최신순으로 정렬
function sortByDate(articles) {
  return articles.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
}

// API: 경쟁사 뉴스
app.get('/api/competitors', async (req, res) => {
  try {
    const results = await Promise.all(
      COMPETITORS.map(async (comp) => {
        try {
          const xml = await fetchRss(comp.query);
          const articles = sortByDate(await parseRss(xml));
          return { name: comp.name, articles };
        } catch (err) {
          return { name: comp.name, articles: [], error: err.message };
        }
      })
    );
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: 키워드 뉴스
app.get('/api/keywords', async (req, res) => {
  try {
    const results = await Promise.all(
      KEYWORDS.map(async (kw) => {
        try {
          const xml = await fetchRss(kw.query);
          const articles = sortByDate(await parseRss(xml));
          return { name: kw.name, articles };
        } catch (err) {
          return { name: kw.name, articles: [], error: err.message };
        }
      })
    );
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Summary (경쟁사 + 키워드 각 최신 5개씩)
app.get('/api/summary', async (req, res) => {
  try {
    const allSources = [
      ...COMPETITORS.map(c => ({ ...c, type: 'competitor' })),
      ...KEYWORDS.map(k => ({ ...k, type: 'keyword' })),
    ];

    const results = await Promise.all(
      allSources.map(async (src) => {
        try {
          const xml = await fetchRss(src.query);
          const articles = sortByDate(await parseRss(xml)).slice(0, 5);
          return { name: src.name, type: src.type, articles };
        } catch (err) {
          return { name: src.name, type: src.type, articles: [], error: err.message };
        }
      })
    );

    res.json({
      competitors: results.filter(r => r.type === 'competitor'),
      keywords: results.filter(r => r.type === 'keyword'),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`뉴스 대시보드 서버 실행 중: http://localhost:${PORT}`);
});
