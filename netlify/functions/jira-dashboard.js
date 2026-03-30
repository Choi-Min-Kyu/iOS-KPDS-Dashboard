const { fetchDashboardPayload } = require("./_lib/kpds-data");

function response(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
    },
    body: JSON.stringify(body),
  };
}

exports.handler = async function handler() {
  try {
    return response(200, await fetchDashboardPayload());
  } catch (error) {
    return response(500, {
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
