const express = require("express");
const jwt = require("jsonwebtoken");

const app = express();
const port = Number(process.env.PORT || 3002);
const secret = process.env.JWT_SECRET || "change-me-in-production";
const orders = [
  { id: "o-2001", userId: "u-1001", status: "paid", total: 129.9, currency: "USD" },
  { id: "o-2002", userId: "u-1001", status: "shipping", total: 49.5, currency: "USD" },
  { id: "o-2003", userId: "u-1002", status: "completed", total: 210, currency: "USD" }
];

app.get("/health", (req, res) => res.json({ service: "order-service", status: "ok" }));
app.use("/orders", (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) return res.status(401).json({ error: "Missing bearer token" });
  try {
    req.user = jwt.verify(header.slice(7), secret);
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
});
app.get("/orders", (req, res) => res.json(orders.filter((order) => order.userId === req.user.sub)));
app.get("/orders/user/:userId", (req, res) => {
  if (req.params.userId !== req.user.sub) return res.status(403).json({ error: "Cannot access another user's orders" });
  return res.json(orders.filter((order) => order.userId === req.user.sub));
});
app.get("/orders/:id", (req, res) => {
  const order = orders.find((item) => item.id === req.params.id);
  if (!order || order.userId !== req.user.sub) return res.status(404).json({ error: "Order not found" });
  return res.json(order);
});

app.listen(port, () => console.log(`order-service listening on ${port}`));
