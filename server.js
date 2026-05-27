const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;

function loadEnvFile() {
  const envPath = path.join(root, ".env");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  lines.forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const index = trimmed.indexOf("=");
    if (index === -1) return;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  });
}

loadEnvFile();

const port = Number(process.env.PORT || 3000);
const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
const apiKey = process.env.OPENAI_API_KEY;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".txt": "text/plain; charset=utf-8"
};

function sendJson(res, status, data) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function extractJson(text) {
  const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Gemini response did not contain JSON");
  return JSON.parse(cleaned.slice(start, end + 1));
}

function buildPrompt(payload) {
  return `
너는 한국 청년 한달살기/워케이션 지역 추천 서비스 "일단 살아봄"의 추천 엔진이다.
사용자 입력, 로컬 후보 지역 데이터, 네가 알고 있는 한국 지역 특성을 보고 실제 서비스 UI에 바로 넣을 수 있는 JSON만 반환해라.

규칙:
- 존재하지 않는 지원사업, 일자리, 프로그램을 단정해서 만들지 마라.
- 안전을 단정하지 말고 "확인할 점"으로 표현해라.
- 로컬 후보 지역에 더 적합한 곳이 없으면, 한국의 다른 실제 지역을 새로 추천해도 된다.
- 새 지역을 추천할 때도 존재하지 않는 프로그램이나 일자리를 만들지 말고 생활권 관찰 포인트 중심으로 작성해라.
- 한국어로 작성해라.
- JSON 외의 설명 문장은 출력하지 마라.

반환 스키마:
{
  "region": "추천 지역명",
  "score": 72부터 98 사이 숫자,
  "description": "사용자 조건에 맞춘 추천 이유 1문단",
  "checks": ["체류 전 확인할 점 1", "체류 전 확인할 점 2", "체류 전 확인할 점 3"],
  "weeks": [
    {"title": "1주 차 · ...", "text": "..."},
    {"title": "2주 차 · ...", "text": "..."},
    {"title": "3주 차 · ...", "text": "..."},
    {"title": "4주 차 · ...", "text": "..."}
  ],
  "candidates": [
    {"name": "후보 지역명", "score": 90, "reason": "짧은 이유"},
    {"name": "후보 지역명", "score": 86, "reason": "짧은 이유"},
    {"name": "후보 지역명", "score": 82, "reason": "짧은 이유"}
  ]
}

입력 데이터:
${JSON.stringify(payload, null, 2)}
`.trim();
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function isRetryable(status, message) {
  if (status === 429 || status === 500 || status === 503) return true;
  return /high demand|overloaded|unavailable|try again later|rate limit/i.test(message || "");
}

async function callOpenAiOnce(payload) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      temperature: 0.75,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "너는 한국 청년 한달살기/워케이션 지역 추천 서비스의 추천 엔진이다. 항상 유효한 JSON 객체만 반환한다." },
        { role: "user", content: buildPrompt(payload) }
      ]
    })
  });

  const data = await response.json();
  if (!response.ok) {
    const message = data.error && data.error.message ? data.error.message : "OpenAI request failed";
    return { ok: false, error: message, status: response.status, retryable: isRetryable(response.status, message) };
  }

  const text = data.choices?.[0]?.message?.content || "";
  return { ok: true, result: extractJson(text) };
}

async function recommendWithOpenAi(payload) {
  if (!apiKey) {
    return { ok: false, error: "OPENAI_API_KEY is not set" };
  }

  const maxAttempts = 4;
  let last = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      last = await callOpenAiOnce(payload);
    } catch (error) {
      last = { ok: false, error: error.message, retryable: true };
    }
    if (last.ok || !last.retryable || attempt === maxAttempts) {
      return last;
    }
    // 일시적 과부하(429/503 등)면 점점 더 기다렸다가 재시도
    await sleep(600 * attempt + Math.floor(Math.random() * 300));
  }
  return last;
}

async function handleRecommend(req, res) {
  try {
    const body = await readBody(req);
    const payload = JSON.parse(body || "{}");
    const result = await recommendWithOpenAi(payload);
    sendJson(res, result.ok ? 200 : 503, result);
  } catch (error) {
    sendJson(res, 500, { ok: false, error: error.message });
  }
}

function serveStatic(req, res) {
  const requestPath = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);
  const safePath = requestPath === "/" ? "/index.html" : requestPath;
  const filePath = path.resolve(root, `.${safePath}`);

  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const type = mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream";
    res.writeHead(200, { "content-type": type });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/api/recommend") {
    handleRecommend(req, res);
    return;
  }
  if (req.method === "GET") {
    serveStatic(req, res);
    return;
  }
  res.writeHead(405);
  res.end("Method not allowed");
});

server.listen(port, () => {
  console.log(`일단 살아봄 running at http://localhost:${port}`);
});
