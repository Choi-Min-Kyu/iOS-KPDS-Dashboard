const { BASE_URL, fetchDashboardPayload } = require("./lib/kpds-data");

const CONFLUENCE_PAGE_ID = process.env.CONFLUENCE_PAGE_ID || "5773133029";
const JIRA_EMAIL = process.env.JIRA_EMAIL;
const JIRA_TOKEN = process.env.JIRA_TOKEN;
const CONFLUENCE_BASE_URL = `${BASE_URL.replace(/\/$/, "")}/wiki`;

function requireEnv() {
  if (!JIRA_EMAIL || !JIRA_TOKEN) {
    throw new Error("Environment variables JIRA_EMAIL and JIRA_TOKEN are required.");
  }
}

function authHeader() {
  return `Basic ${Buffer.from(`${JIRA_EMAIL}:${JIRA_TOKEN}`).toString("base64")}`;
}

async function requestJson(path) {
  const result = await fetch(`${CONFLUENCE_BASE_URL}${path}`, {
    headers: {
      Accept: "application/json",
      Authorization: authHeader(),
    },
  });

  if (!result.ok) {
    throw new Error(`Confluence request failed (${result.status}): ${await result.text()}`);
  }

  return result.json();
}

async function updatePage({ id, title, version, value }) {
  const result = await fetch(`${CONFLUENCE_BASE_URL}/rest/api/content/${id}`, {
    method: "PUT",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: authHeader(),
    },
    body: JSON.stringify({
      id,
      type: "page",
      title,
      version: {
        number: version + 1,
        minorEdit: true,
      },
      body: {
        storage: {
          value,
          representation: "storage",
        },
      },
    }),
  });

  if (!result.ok) {
    throw new Error(`Confluence update failed (${result.status}): ${await result.text()}`);
  }

  return result.json();
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function moduleScope(module) {
  return `전체 ${module.total} / 완료 ${module.done} / 잔여 ${module.remaining}`;
}

function moduleBindings(payload) {
  return new Map(
    payload.modules.map((module) => [
      module.ticket,
      {
        ticket: module.ticket,
        status: module.parentStatusName || module.parentStatusLabel || "해야 할 일",
        progress: `${module.progress}%`,
        scope: moduleScope(module),
      },
    ]),
  );
}

function findExpandSections(body) {
  const matcher = /<ac:structured-macro\b[^>]*ac:name="expand"[^>]*>[\s\S]*?<ac:parameter ac:name="title">([\s\S]*?)<\/ac:parameter>/g;
  const starts = [];
  let match;

  while ((match = matcher.exec(body))) {
    starts.push({
      start: match.index,
      title: match[1],
    });
  }

  return starts.map((item, index) => ({
    ...item,
    end: index + 1 < starts.length ? starts[index + 1].start : body.length,
  }));
}

function replaceRequired(section, pattern, nextValue, label, ticket) {
  if (!pattern.test(section)) {
    throw new Error(`Confluence section for ${ticket} is missing ${label}.`);
  }

  return section.replace(pattern, `$1${escapeXml(nextValue)}$3`);
}

function updateModuleSection(section, values) {
  let updated = section;

  updated = replaceRequired(
    updated,
    /(<p\b[^>]*><strong>상태<\/strong>:\s*<ac:structured-macro\b[\s\S]*?<ac:parameter ac:name="title">)([\s\S]*?)(<\/ac:parameter>)/,
    values.status,
    "status",
    values.ticket,
  );

  updated = replaceRequired(
    updated,
    /(<p\b[^>]*><strong>진행률<\/strong>:\s*)([\s\S]*?)(<\/p>)/,
    values.progress,
    "progress",
    values.ticket,
  );

  updated = replaceRequired(
    updated,
    /(<p\b[^>]*><strong>범위<\/strong>:\s*)([\s\S]*?)(<\/p>)/,
    values.scope,
    "scope",
    values.ticket,
  );

  return updated;
}

function renderUpdatedBody(body, payload) {
  const bindings = moduleBindings(payload);
  const sections = findExpandSections(body);
  const foundTickets = new Set();
  let cursor = 0;
  let updated = "";

  sections.forEach((section) => {
    const ticket = Array.from(bindings.keys()).find((value) => section.title.includes(value));
    const raw = body.slice(section.start, section.end);

    updated += body.slice(cursor, section.start);

    if (!ticket) {
      updated += raw;
      cursor = section.end;
      return;
    }

    foundTickets.add(ticket);
    updated += updateModuleSection(raw, bindings.get(ticket));
    cursor = section.end;
  });

  updated += body.slice(cursor);

  const missing = Array.from(bindings.keys()).filter((ticket) => !foundTickets.has(ticket));
  if (missing.length) {
    throw new Error(`Confluence page is missing module sections for: ${missing.join(", ")}`);
  }

  return updated;
}

async function fetchPage() {
  return requestJson(`/rest/api/content/${CONFLUENCE_PAGE_ID}?expand=body.storage,version,title`);
}

async function syncConfluence() {
  requireEnv();

  const [payload, page] = await Promise.all([fetchDashboardPayload(), fetchPage()]);
  const currentBody = page.body?.storage?.value || "";
  const nextBody = renderUpdatedBody(currentBody, payload);
  const changed = currentBody !== nextBody;

  if (!changed) {
    console.log("No changes detected, skipping update.");
    return;
  }

  try {
    const updatedPage = await updatePage({
      id: page.id,
      title: page.title,
      version: page.version.number,
      value: nextBody,
    });

    console.log(`Confluence page updated: ${updatedPage.title} (v${updatedPage.version?.number})`);
  } catch (error) {
    if (!String(error.message || "").includes("(409)")) {
      throw error;
    }

    const latestPage = await fetchPage();
    const latestBody = latestPage.body?.storage?.value || "";

    if (latestBody === nextBody) {
      console.log("Conflict resolved: page already has the expected content.");
      return;
    }

    throw error;
  }
}

syncConfluence().catch((error) => {
  console.error("Confluence sync failed:", error.message);
  process.exit(1);
});
