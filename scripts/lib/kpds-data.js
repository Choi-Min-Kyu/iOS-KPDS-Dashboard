const BASE_URL = (process.env.ATLASSIAN_BASE_URL || "https://kurly0521.atlassian.net").replace(/\/$/, "");
const JIRA_EMAIL = process.env.JIRA_EMAIL;
const JIRA_TOKEN = process.env.JIRA_TOKEN;

const EPIC_TICKET = "KMA-6396";
const MODULES = [
  { name: "검색 (Search)", ticket: "KMA-6417" },
  { name: "Recommendation", ticket: "KMA-6566" },
  { name: "List", ticket: "KMA-6670" },
  { name: "Product List", ticket: "KMA-6706" },
  { name: "Detail (상품 상세)", ticket: "KMA-6760" },
  { name: "AI Guide", ticket: "KMA-7031" },
];

const STATUS_PROGRESS = {
  done: 100,
  qa: 90,
  review: 70,
  progress: 45,
  blocked: 15,
  todo: 0,
};

const STATUS_LABEL = {
  done: "DONE",
  qa: "QA",
  review: "REVIEW",
  progress: "진행 중",
  blocked: "차단",
  todo: "해야 할 일",
};

const BLOCKED_NAMES = new Set(["blocked", "차단", "blocker"]);

function requireEnv() {
  if (!JIRA_EMAIL || !JIRA_TOKEN) {
    throw new Error("Environment variables JIRA_EMAIL and JIRA_TOKEN are required.");
  }
}

function authHeader() {
  return `Basic ${Buffer.from(`${JIRA_EMAIL}:${JIRA_TOKEN}`).toString("base64")}`;
}

async function requestJson(path, params = {}) {
  const url = new URL(`${BASE_URL}${path}`);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  });

  const result = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: authHeader(),
    },
  });

  if (!result.ok) {
    const detail = await result.text();
    throw new Error(`Jira request failed (${result.status}): ${detail}`);
  }

  return result.json();
}

async function searchJql(jql, fields) {
  const issues = [];
  let nextPageToken = "";

  while (true) {
    const payload = await requestJson("/rest/api/3/search/jql", {
      jql,
      fields,
      maxResults: "100",
      nextPageToken,
    });

    issues.push(...(payload.issues || []));

    if (payload.isLast || !payload.nextPageToken) {
      return issues;
    }

    nextPageToken = payload.nextPageToken;
  }
}

function classifyStatus(status = {}) {
  const statusName = (status.name || "").trim();
  const lowered = statusName.toLowerCase();
  const upper = statusName.toUpperCase();
  const category = ((status.statusCategory || {}).name || "").trim();

  if (BLOCKED_NAMES.has(lowered)) {
    return "blocked";
  }

  if (upper === "REVIEW") {
    return "review";
  }

  if (upper === "QA") {
    return "qa";
  }

  if (category === "Done") {
    return "done";
  }

  if (statusName === "진행 중" || category === "In Progress") {
    return "progress";
  }

  return "todo";
}

function statusLabel(kind) {
  return STATUS_LABEL[kind] || "해야 할 일";
}

function assigneeName(assignee) {
  return assignee && assignee.displayName ? assignee.displayName : "Unassigned";
}

function assigneeAvatar(assignee) {
  return assignee && assignee.avatarUrls
    ? assignee.avatarUrls["24x24"] || assignee.avatarUrls["32x32"] || assignee.avatarUrls["48x48"] || ""
    : "";
}

function statusWeight(status) {
  return {
    blocked: 0,
    progress: 1,
    review: 2,
    qa: 3,
    todo: 4,
    done: 5,
  }[status] ?? 4;
}

function issueNumber(key) {
  const match = /-(\d+)$/.exec(key || "");
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

async function fetchDashboardPayload() {
  requireEnv();

  const moduleTickets = MODULES.map((module) => module.ticket).join(",");
  const parentTickets = `${EPIC_TICKET},${moduleTickets}`;

  const [parentIssues, childIssues] = await Promise.all([
    searchJql(`key IN (${parentTickets})`, "key,summary,status,assignee"),
    searchJql(`parent IN (${moduleTickets})`, "key,summary,parent,status,assignee,updated,priority"),
  ]);

  const issuesByKey = new Map(parentIssues.map((issue) => [issue.key, issue]));
  const modulesByTicket = new Map(
    MODULES.map((module) => {
      const parentIssue = issuesByKey.get(module.ticket);
      const parentFields = parentIssue?.fields || {};
      const parentKind = classifyStatus(parentFields.status || {});

      return [
        module.ticket,
        {
          ...module,
          done: 0,
          remaining: 0,
          inProgress: 0,
          blocked: 0,
          total: 0,
          progress: 0,
          children: [],
          url: `${BASE_URL}/browse/${module.ticket}`,
          parentStatus: parentKind,
          parentStatusLabel: statusLabel(parentKind),
          parentStatusName: (parentFields.status || {}).name || statusLabel(parentKind),
          parentAssignee: assigneeName(parentFields.assignee),
          parentAvatarUrl: assigneeAvatar(parentFields.assignee),
        },
      ];
    }),
  );

  childIssues.forEach((issue) => {
    const fields = issue.fields || {};
    const parentKey = (fields.parent || {}).key;
    const module = modulesByTicket.get(parentKey);

    if (!module) {
      return;
    }

    const kind = classifyStatus(fields.status || {});

    module.total += 1;
    if (kind === "done") {
      module.done += 1;
    } else if (["progress", "review", "qa"].includes(kind)) {
      module.inProgress += 1;
    } else if (kind === "blocked") {
      module.blocked += 1;
    }

    module.children.push({
      key: issue.key,
      name: fields.summary || issue.key,
      progress: STATUS_PROGRESS[kind],
      status: kind,
      statusLabel: statusLabel(kind),
      assignee: assigneeName(fields.assignee),
      avatarUrl: assigneeAvatar(fields.assignee),
      updated: fields.updated || "",
      priority: (fields.priority || {}).name || "",
      url: `${BASE_URL}/browse/${issue.key}`,
    });
  });

  const modules = MODULES.map((module) => {
    const item = modulesByTicket.get(module.ticket);

    item.children.sort((lhs, rhs) => {
      const byStatus = statusWeight(lhs.status) - statusWeight(rhs.status);
      if (byStatus !== 0) {
        return byStatus;
      }
      return issueNumber(lhs.key) - issueNumber(rhs.key);
    });

    if (item.total > 0) {
      item.remaining = Math.max(0, item.total - item.done);
      item.progress = Math.round(item.children.reduce((sum, child) => sum + child.progress, 0) / item.total);

      if (item.parentAssignee === "Unassigned") {
        const fallbackChild = item.children.find((child) => child.assignee !== "Unassigned");
        if (fallbackChild) {
          item.parentAssignee = fallbackChild.assignee;
          item.parentAvatarUrl = fallbackChild.avatarUrl;
        }
      }

      return item;
    }

    item.total = 1;
    item.done = item.parentStatus === "done" ? 1 : 0;
    item.inProgress = ["progress", "review", "qa"].includes(item.parentStatus) ? 1 : 0;
    item.blocked = item.parentStatus === "blocked" ? 1 : 0;
    item.remaining = item.done ? 0 : 1;
    item.progress = STATUS_PROGRESS[item.parentStatus] ?? 0;
    return item;
  });

  const epic = issuesByKey.get(EPIC_TICKET);
  const epicFields = epic?.fields || {};
  const epicKind = classifyStatus(epicFields.status || {});
  const totals = modules.reduce(
    (result, module) => {
      result.total += module.total;
      result.done += module.done;
      result.inProgress += module.inProgress;
      result.blocked += module.blocked;
      return result;
    },
    { total: 0, done: 0, inProgress: 0, blocked: 0 },
  );

  totals.remaining = Math.max(0, totals.total - totals.done);
  totals.progress = totals.total ? Math.round((totals.done / totals.total) * 100) : 0;

  return {
    generatedAt: new Date().toISOString(),
    epic: {
      ticket: EPIC_TICKET,
      status: epicKind,
      statusLabel: statusLabel(epicKind),
      statusName: (epicFields.status || {}).name || statusLabel(epicKind),
      url: `${BASE_URL}/browse/${EPIC_TICKET}`,
    },
    summary: {
      moduleCount: modules.length,
      childCount: childIssues.length,
      ...totals,
    },
    modules,
  };
}

module.exports = {
  BASE_URL,
  EPIC_TICKET,
  MODULES,
  STATUS_LABEL,
  STATUS_PROGRESS,
  fetchDashboardPayload,
};
