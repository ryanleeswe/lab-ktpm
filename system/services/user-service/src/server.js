const express = require("express");
const jwt = require("jsonwebtoken");
const Minio = require("minio");

const app = express();
const port = Number(process.env.PORT || 3001);
const secret = process.env.JWT_SECRET || "change-me-in-production";
const users = [
  { id: "u-1001", name: "Demo User", email: "demo@example.com", password: "P@ssword123!", avatarKey: null },
  { id: "u-1002", name: "Test User", email: "test@example.com", password: "P@ssword123!", avatarKey: null }
];
function createMinioClient(endpoint) {
  const parsed = new URL(endpoint);
  return new Minio.Client({
    endPoint: parsed.hostname,
    port: Number(parsed.port || (parsed.protocol === "https:" ? 443 : 80)),
    useSSL: parsed.protocol === "https:",
    accessKey: process.env.MINIO_ACCESS_KEY || "minioadmin",
    secretKey: process.env.MINIO_SECRET_KEY || "minioadmin"
  });
}

// Internal client reaches MinIO from Docker; public client signs URLs for the browser-facing host.
const minio = createMinioClient(process.env.MINIO_ENDPOINT || "http://localhost:9000");
const publicMinio = createMinioClient(process.env.MINIO_PUBLIC_ENDPOINT || process.env.MINIO_ENDPOINT || "http://localhost:9000");
const bucket = process.env.MINIO_BUCKET || "avatars";

app.use(express.json());
app.get("/health", (req, res) => res.json({ service: "user-service", status: "ok" }));

app.post("/auth/login", (req, res) => {
  const user = users.find((item) => item.email === req.body.email && item.password === req.body.password);
  if (!user) return res.status(401).json({ error: "Invalid credentials" });
  const token = jwt.sign({ sub: user.id, email: user.email, name: user.name }, secret, { expiresIn: "1h" });
  return res.json({ token, user: publicUser(user) });
});

app.use("/users", verifyToken);
app.get("/users", (req, res) => res.json(users.map(publicUser)));
app.get("/users/:id", (req, res) => {
  const user = users.find((item) => item.id === req.params.id);
  return user ? res.json(publicUser(user)) : res.status(404).json({ error: "User not found" });
});

app.post("/users/avatar/presign", async (req, res) => {
  const user = users.find((item) => item.id === req.user.sub);
  if (!user) return res.status(404).json({ error: "User not found" });
  const extension = String(req.body.extension || "jpg").replace(/[^a-z0-9]/gi, "").toLowerCase();
  const objectName = `${user.id}/${Date.now()}.${extension || "jpg"}`;
  try {
    const exists = await minio.bucketExists(bucket);
    if (!exists) await minio.makeBucket(bucket);
    const uploadUrl = await publicMinio.presignedPutObject(bucket, objectName, 300);
    return res.json({ uploadUrl, objectKey: objectName, expiresInSeconds: 300 });
  } catch {
    return res.status(503).json({ error: "Object storage unavailable" });
  }
});

app.post("/users/avatar/complete", async (req, res) => {
  const user = users.find((item) => item.id === req.user.sub);
  const objectKey = String(req.body.objectKey || "");
  if (!user) return res.status(404).json({ error: "User not found" });
  if (!objectKey.startsWith(`${user.id}/`) || objectKey.includes("..")) {
    return res.status(400).json({ error: "Invalid avatar object key" });
  }
  try {
    await minio.statObject(bucket, objectKey);
    user.avatarKey = objectKey;
    return res.json({ user: publicUser(user) });
  } catch (error) {
    if (error.code === "NoSuchKey" || error.code === "NotFound") {
      return res.status(404).json({ error: "Uploaded avatar not found" });
    }
    return res.status(503).json({ error: "Object storage unavailable" });
  }
});

function verifyToken(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) return res.status(401).json({ error: "Missing bearer token" });
  try {
    req.user = jwt.verify(header.slice(7), secret);
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, avatarKey: user.avatarKey };
}

app.listen(port, () => console.log(`user-service listening on ${port}`));
