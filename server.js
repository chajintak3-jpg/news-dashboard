const express = require('express');
const https = require('https');
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

// Google News RSS를 rss2json 프록시를 통해 가져오기
function fetchNews(query) {
  const googleRssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=ko&gl=KR&ceid=KR:ko`;
  const url = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(googleRssUrl)}`;

  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.status !== 'ok') {
            return resolve([]);
          }
          const articles = (json.items || []).map(item => {
            let desc = (item.description || item.content || '').replace(/<[^>]*>/g, '').trim();
            let title = (item.title || '').replace(/<[^>]*>/g, '').trim();
            // source를 title에서 추출 (title 형식: "기사제목 - 출처")
            let source = '';
            const dashIdx = title.lastIndexOf(' - ');
            if (dashIdx > 0) {
              source = title.substring(dashIdx + 3).trim();
              title = title.substring(0, dashIdx).trim();
            }
            return {
              title,
              link: item.link || '',
              description: desc,
              pubDate: item.pubDate || '',
              source,
            };
          });
          resolve(articles);
        } catch (e) {
          reject(e);
        }
      });
      res.on('error', reject);
    }).on('error', reject);
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
          const articles = sortByDate(await fetchNews(comp.query));
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
          const articles = sortByDate(await fetchNews(kw.query));
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
          const articles = sortByDate(await fetchNews(src.query)).slice(0, 5);
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
