"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const playwright = process.env.SC_PLAYWRIGHT_PATH || path.join(os.homedir(), ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const { chromium } = require(playwright);
const rendererPath = "skills/survey-corps/mcp-app/assets/sc-task-view.html";
const source = process.env.SC_POINTER_BASELINE
  ? spawnSync("git", ["show", process.env.SC_POINTER_BASELINE + ":" + rendererPath], { encoding: "utf8" })
  : { status: 0, stdout: fs.readFileSync(path.join(__dirname, "assets/sc-task-view.html"), "utf8") };
assert.equal(source.status, 0, source.stderr);
const template = source.stdout;
// SC-UI-POINTER-001: recorded finished payload from the user-reported layout, excluding unused audit fields.
const finished = {
  "view_id": "sc-task-view:sc-summary-top-gap-20261026",
  "state": "workflow_ready",
  "work_unit": {
    "work_unit_id": "sc-summary-top-gap-20261026",
    "target": "总结收起文件栏，进行中显示完整路径并压缩文件栏加框",
    "task_type": "总结布局修复",
    "roles": [
      "dev",
      "cr",
      "qa"
    ],
    "role_selection_reason": "最小样式修复及独立审查验收",
    "reference_version": "f505cfb + FINAL:a64e92e11c5585fd5f316c6fe7ddab89b2a9bd6000f340349f53d0311646e891",
    "git": {
      "repository": "kyojin",
      "branch": "codex/sc-git-animated-emoji"
    },
    "summary": "文件栏内容高度减半至22px，新增2px圆角边框；进行中显示真实上报的完整路径，总结时不再保留文件栏和顶部空位。",
    "verified_scope": [
      "320/960下文件条内容22px、外高26px、四边2px；当前完整路径行无截字",
      "总结移除文件框与顶部占位；悬停及返回无高度抖动",
      "六项正式验证通过，同最终基线CR及QA通过，阻断0",
      "本机技能目录与插件缓存共6个副本hash一致；两处服务和UI contract烟测通过"
    ],
    "unverified_scope": [
      "跨浏览器与其他系统字体；宿主旧面板可能缓存模板"
    ],
    "risks": [],
    "metrics": {
      "elapsed_ms": 1488899
    }
  },
  "role_details": {
    "dev": {
      "status": "passed",
      "summary": "总结紧凑、文件半高加框及悬停尺寸修复完成",
      "metrics": {
        "elapsed_ms": 522746
      },
      "evidence": [
        "320/960长详情总结→悬停→返回外框尺寸一致",
        "总结标题距框16px；文件框内容22px、总26px，完整路径可读"
      ]
    },
    "cr": {
      "status": "passed",
      "metrics": {
        "elapsed_ms": 350068
      },
      "summary": "最终实现、三文件及高度探针均复审通过，阻断0",
      "evidence": [
        "最终聚合a64e92e11c5585fd5f316c6fe7ddab89b2a9bd6000f340349f53d0311646e891",
        "内容区裁切、边框外高及总结切换等高断言有效"
      ]
    },
    "qa": {
      "status": "passed",
      "metrics": {
        "elapsed_ms": 616085
      },
      "summary": "320/960布局与实际字形检查通过，未关闭阻断0",
      "evidence": [
        "behavior、UI contract、motion、gap、compact、height六项正式命令exit0",
        "当前完整行中英文字形无截字，内容22px/框总高26px/四边2px",
        "总结无文件栏及顶部占位；hover切换严格等高；页面和console错误0"
      ]
    }
  }
};
const evidence = fs.mkdtempSync(path.join(os.tmpdir(), "sc-pointer-exit-qa-"));
const report = { baseline: process.env.SC_POINTER_BASELINE || "working-tree", errors: [], console: [], cases: [] };

async function fixture(browser, zoom, width = 680, reduced = false) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 1700 }, reducedMotion: reduced ? "reduce" : "no-preference" });
  page.on("pageerror", error => report.errors.push(error.message));
  page.on("console", message => { if (["error", "warning"].includes(message.type())) report.console.push(message.text()); });
  await page.setContent('<style>body{margin:0}iframe{position:absolute;left:20px;top:20px;height:1200px;border:0}</style><iframe></iframe>');
  await page.locator("iframe").evaluate((node, value) => { node.style.width = value.width + "px"; node.srcdoc = '<main id="root">' + value.html + '</main>'; }, { width, html: template });
  const frame = await page.locator("iframe").contentFrame();
  await frame.locator("body").evaluate((_, value) => {
    document.documentElement.style.zoom = value.zoom;
    renderSurveyCorpsTaskView(document.getElementById("root"), value.payload);
    window.measure = () => {
      const view = document.querySelector(".sc-task-view").getBoundingClientRect();
      const panel = document.querySelector("[data-sc-role-preview]").getBoundingClientRect(), doc = document.documentElement;
      return { owner: document.getElementById("root").__scPreviewRole, view: [view.width, view.height, view.bottom], panel: [panel.width, panel.height], scroll: [doc.scrollWidth, doc.clientWidth, doc.scrollHeight, doc.clientHeight], gutter: innerWidth - doc.clientWidth, summaryVisible: document.querySelector("[data-sc-preview-summary] .sc-task-view__summary-title").checkVisibility({ visibilityProperty: true }) };
    };
  }, { zoom, payload: finished });
  return { page, frame };
}

async function pointerExit(browser, zoom, width = 680, reduced = false) {
  const { page, frame } = await fixture(browser, zoom, width, reduced);
  for (const role of ["dev", "cr", "qa"]) {
    await frame.locator('[data-sc-role="' + role + '"] > summary').hover();
    await page.waitForTimeout(60);
    const height = await frame.locator("body").evaluate(() => Math.ceil(document.querySelector(".sc-task-view").getBoundingClientRect().bottom + parseFloat(getComputedStyle(document.body).marginBottom) * parseFloat(getComputedStyle(document.documentElement).zoom)));
    await page.locator("iframe").evaluate((node, height) => node.style.height = height + "px", height);
    await page.waitForTimeout(40);
    const before = await frame.locator("body").evaluate(() => {
      window.trace = []; window.tracing = true;
      function sample() { trace.push(measure()); if (tracing) requestAnimationFrame(sample); }
      sample(); return measure();
    });
    if (width > 560) {
      assert.equal(before.owner, role, "the intended hovered role owns the desktop preview");
      assert.equal(before.summaryVisible, false, "desktop hover really switches away from the task summary");
    }
    await page.mouse.move(1100, 10, { steps: 5 });
    await page.waitForTimeout(100);
    const frames = await frame.locator("body").evaluate(() => { tracing = false; return trace; });
    const item = { zoom, width, reduced, role, iframeHeight: height, before, frames };
    report.cases.push(item);
    assert.ok(frames.length >= 3, "capture real animation frames during iframe exit");
    for (const current of [before, ...frames]) {
      assert.equal(current.scroll[0], current.scroll[1], "no horizontal overflow");
      assert.equal(current.scroll[2], current.scroll[3], "pointer exit must not introduce vertical overflow");
      for (const key of ["view", "panel"]) current[key].forEach((value, index) => assert.ok(Math.abs(value - before[key][index]) < .02, role + " exit preserves " + key + " geometry"));
    }
    assert.equal(frames.at(-1).summaryVisible, true, "pointer outside iframe returns to visible task summary");
  }
  await page.close();
}

async function readingAndScroll(browser) {
  const { page, frame } = await fixture(browser, 1);
  const file = "skills/survey-corps/mcp-app/" + "long-directory/".repeat(30) + "Abc_gjpqy_中文.js";
  const payload = structuredClone(finished);
  payload.view_id = "pointer-exit:running"; payload.state = "dev_in_progress";
  payload.role_details.dev = { status: "running", summary: "真实长内容 ".repeat(1200), evidence: ["evidence"], file_activity: { previous: "src/A.js", current: file, next: "test/C.js" } };
  payload.role_details.cr.status = "pending"; payload.role_details.qa.status = "pending";
  await frame.locator("body").evaluate((_, payload) => renderSurveyCorpsTaskView(document.getElementById("root"), payload), payload);
  await page.locator("iframe").evaluate(node => node.style.height = "480px");
  const line = frame.locator("[data-sc-role-preview] > [data-sc-file-activity] [data-sc-file-current]");
  assert.equal(await line.textContent(), file, "running paths remain complete");
  await line.focus(); await line.evaluate(node => { node.scrollLeft = node.scrollWidth; });
  const scroll = await line.evaluate(node => node.scrollLeft); assert.ok(scroll > 0, "long path can be read horizontally");
  await frame.locator("body").evaluate((_, payload) => renderSurveyCorpsTaskView(document.getElementById("root"), payload), payload);
  assert.deepEqual(await line.evaluate(node => [document.activeElement === node, node.scrollLeft]), [true, scroll], "same-file refresh preserves reading focus and position");
  await frame.locator("body").evaluate(() => { document.activeElement.blur(); window.scrollTo(0, 0); });
  await page.mouse.move(650, 400); await page.mouse.wheel(0, 500); await page.waitForTimeout(120);
  const state = await frame.locator("body").evaluate(() => ({ y: scrollY, scroll: document.documentElement.scrollHeight, client: document.documentElement.clientHeight, overflow: getComputedStyle(document.documentElement).overflowY }));
  report.reading = { file, horizontalScroll: scroll, ...state };
  assert.ok(state.scroll > state.client && state.y > 0, "real long content retains native vertical scrolling");
  assert.ok(!["hidden", "clip"].includes(state.overflow), "scrollbars are not suppressed to hide jitter");
  await page.close();
}

(async () => {
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  try {
    for (const zoom of [.8, 1, 1.25]) await pointerExit(browser, zoom);
    await pointerExit(browser, 1, 320, true);
    await readingAndScroll(browser);
    assert.deepEqual(report.errors, []); assert.deepEqual(report.console, []);
    console.log("SC pointer exit regression passed (fixed iframe, three zooms, narrow reduced motion, reading and native scroll).");
  } finally {
    fs.writeFileSync(path.join(evidence, "result.json"), JSON.stringify(report, null, 2));
    console.log("Browser evidence retained: " + evidence);
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
