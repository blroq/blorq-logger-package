"use strict";
let p = 0,
  f = 0;
function ok(d, fn) {
  try {
    fn();
    console.log("  \u2705 " + d);
    p++;
  } catch (e) {
    console.error("  \u274c " + d + "\n     " + e.message);
    f++;
  }
}
console.log("\nblorq-logger tests\n");
const {
  Logger,
  state,
  buildEntry,
  shouldLog,
  safeStringify,
} = require("../src/core");
ok("buildEntry returns valid JSON", () => {
  const obj = JSON.parse(
    buildEntry("info", "test-app", { req: "abc" }, "hello", []),
  );
  if (obj.level !== "INFO") throw new Error("level=" + obj.level);
  if (obj.message !== "hello") throw new Error("msg");
});
ok("shouldLog filters by level", () => {
  state.cfg.level = "warn";
  if (shouldLog("info")) throw new Error("info should be filtered");
  if (!shouldLog("error")) throw new Error("error should pass");
  state.cfg.level = "info";
});
ok("child logger inherits context", () => {
  const c = new Logger({ svc: "pay" }).child({ uid: "123" });
  if (c._ctx.svc !== "pay") throw new Error("parent ctx lost");
  if (c._ctx.uid !== "123") throw new Error("child ctx not set");
});
ok("sensitive keys masked", () => {
  const r = JSON.parse(
    safeStringify({ user: "alice", password: "s3cr3t", token: "tok" }),
  );
  if (r.password !== "***") throw new Error("password not masked");
  if (r.token !== "***") throw new Error("token not masked");
  if (r.user !== "alice") throw new Error("user should not be masked");
});
const blorq = require("../src/index");
ok("root logger has full API", () => {
  [
    "configure",
    "create",
    "install",
    "uninstall",
    "requestLogger",
    "debug",
    "info",
    "warn",
    "error",
    "fatal",
    "flush",
  ].forEach((m) => {
    if (typeof blorq[m] !== "function") throw new Error("missing: " + m);
  });
});
ok("express middleware is (req,res,next)", () => {
  const mw = require("../src/adapters/express").requestMiddleware();
  if (typeof mw !== "function" || mw.length !== 3)
    throw new Error("wrong signature");
});
ok("express middleware skips /health", () => {
  const mw = require("../src/adapters/express").requestMiddleware({
    skipPaths: ["/health"],
  });
  let called = false;
  mw(
    { path: "/health", url: "/health", headers: {}, method: "GET" },
    {
      statusCode: 200,
      getHeader: () => "0",
      setHeader: () => {},
      once: () => {},
    },
    () => {
      called = true;
    },
  );
  if (!called) throw new Error("should have called next");
});
console.log("\n  " + (p + f) + " tests: " + p + " passed, " + f + " failed\n");
if (f > 0) process.exit(1);
