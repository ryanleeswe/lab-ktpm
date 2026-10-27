const express = require("express");
const rateLimit = require("express-rate-limit");
const jwt = require("jsonwebtoken");
const axios = require("axios");

const app = express();
const port = Number(process.env.PORT || 8080);
const secret = process.env.JWT_SECRET || "change-me-in-production";
const usersUrl = process.env.USER_SERVICE_URL || "http://localhost:3001";
const ordersUrl = process.env.ORDER_SERVICE_URL || "http://localhost:3002";
const upstreamTimeoutMs = Number(process.env.UPSTREAM_TIMEOUT_MS || 5000);

app.use(express.json({ limit: "1mb" }));
app.use((req, res, next) => {
  const started = process.hrtime.bigint();
  const end = res.end;
  res.end = function (...args) {
    const elapsed = Number(process.hrtime.bigint() - started) / 1000000;
    res.setHeader("x-response-time-ms", elapsed.toFixed(2));
    return end.apply(this, args);
  };
  next();
});
app.use(rateLimit({
  windowMs: 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many requests; limit is 10 per second" }
}));

function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing bearer token" });
  }
  try {
    req.user = jwt.verify(header.slice(7), secret);
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

async function proxy(req, res, url, path) {
  try {
    const response = await axios({
      method: req.method,
      url: `${url}${path}`,
      data: req.body,
      headers: { authorization: req.headers.authorization },
      timeout: upstreamTimeoutMs
    });
    return res.status(response.status).json(response.data);
  } catch (error) {
    const status = error.response?.status || 502;
    return res.status(status).json(error.response?.data || { error: "Upstream service unavailable" });
  }
}

app.get("/health", (req, res) => res.json({ service: "gateway", status: "ok" }));
app.post("/api/auth/login", (req, res) => proxy(req, res, usersUrl, "/auth/login"));
app.use("/api/users", authenticate, (req, res) => {
  const servicePath = req.originalUrl.replace(/^\/api\/users(?=\/|\?|$)/, "/users");
  return proxy(req, res, usersUrl, servicePath);
});
app.use("/api/orders", authenticate, (req, res) => {
  const servicePath = req.originalUrl.replace(/^\/api\/orders(?=\/|\?|$)/, "/orders");
  return proxy(req, res, ordersUrl, servicePath);
});

app.get("/api/dashboard", authenticate, async (req, res) => {
  try {
    const [userResponse, orderResponse] = await Promise.all([
      axios.get(`${usersUrl}/users/${encodeURIComponent(req.user.sub)}`, {
        headers: { authorization: req.headers.authorization }, timeout: upstreamTimeoutMs
      }),
      axios.get(`${ordersUrl}/orders/user/${encodeURIComponent(req.user.sub)}`, {
        headers: { authorization: req.headers.authorization }, timeout: upstreamTimeoutMs
      })
    ]);
    return res.json({
      user: userResponse.data,
      orders: orderResponse.data,
      orderCount: orderResponse.data.length
    });
  } catch (error) {
    return res.status(error.response?.status || 502).json({ error: "Dashboard aggregation failed" });
  }
});

app.use((req, res) => res.status(404).json({ error: "Route not found" }));
app.listen(port, () => console.log(`gateway listening on ${port}`));
