// TEMP AUDIT SCRIPT (removal at end). Read-only catalog inspection.
// Reads DATABASE_URL_UNPOOLED from .env.local via node --env-file. Never prints secrets.
const fs = require("fs");
const { Client } = require("pg");

const DOC = {
  full: ["profiles","video_folders","videos","player_configs","video_events","video_live_sessions","video_versions","ab_tests","ab_test_variants","ab_test_folders","account_access","account_security_settings","security_events","intelligence_controls","ai_analysis_jobs","ai_credit_wallets","ai_credit_checkouts","ai_credit_ledger","billing_customers","billing_checkouts","subscriptions","account_teams","account_team_members","user_inbox","element_experiments","element_experiment_variants","embed_monitors","player_events","video_daily_stats"],
  forAll: ["account_integrations"],
  si: ["billing_churn_surveys"],
  siu: ["support_cases"],
  selectOnly: ["account_team_invites","billing_plans","conversion_templates","ai_credit_products"],
  enableNoPolicy: ["admin_audit_log","payment_webhook_events","rate_limits","seo_targets","visibility_checks"],
  noRls: ["support_notes"],
};
function docPolicyCmds(table) {
  if (DOC.full.includes(table)) return ["SELECT","INSERT","UPDATE","DELETE"];
  if (DOC.forAll.includes(table)) return ["ALL"];
  if (DOC.si.includes(table)) return ["SELECT","INSERT"];
  if (DOC.siu.includes(table)) return ["SELECT","INSERT","UPDATE"];
  if (DOC.selectOnly.includes(table)) return ["SELECT"];
  return [];
}
const docTables = new Set([...DOC.full, ...DOC.forAll, ...DOC.si, ...DOC.siu, ...DOC.selectOnly, ...DOC.enableNoPolicy, ...DOC.noRls]);
const docRlsTables = new Set([...DOC.full, ...DOC.forAll, ...DOC.si, ...DOC.siu, ...DOC.selectOnly, ...DOC.enableNoPolicy]);

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) throw new Error("no DATABASE_URL_UNPOOLED/DATABASE_URL in env");
  const which = process.env.DATABASE_URL_UNPOOLED ? "unpooled" : "pooled";
  const host = new URL(url).host;
  const client = new Client({ connectionString: url, connectionTimeoutMillis: 20000, statement_timeout: 30000 });
  await client.connect();
  console.log("connected host=" + host + " url_kind=" + which);

  const q = async (text) => (await client.query(text)).rows;

  const tables = await q("SELECT c.relname AS tablename, c.relrowsecurity AS rls, c.relforcerowsecurity AS force_rls FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname");
  const policies = await q("SELECT tablename, policyname, cmd, roles::text AS roles, permissive, qual, with_check FROM pg_policies WHERE schemaname='public' ORDER BY tablename, policyname");
  const roles = await q("SELECT rolname, rolsuper, rolcanlogin, rolbypassrls FROM pg_roles WHERE rolname NOT LIKE 'pg\\_%' ESCAPE '\\' ORDER BY rolname");
  const grants = await q("SELECT grantee, table_name, privilege_type FROM information_schema.role_table_grants WHERE table_schema='public' AND grantee IN ('authenticated','anonymous') ORDER BY table_name, grantee, privilege_type");
  const indexes = await q("SELECT tablename, indexname FROM pg_indexes WHERE schemaname='public' ORDER BY tablename, indexname");
  const authFn = await q("SELECT n.nspname AS schema, p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname='user_id' ORDER BY 1");
  const authTables = await q("SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema IN ('neon_auth','auth') ORDER BY 1,2");
  const rows = await q("SELECT relname, n_live_tup FROM pg_stat_user_tables WHERE schemaname='public' ORDER BY relname");
  const meta = await q("SELECT current_user, session_user, current_database() AS db, version() AS version");
  const drizzleJournal = await q("SELECT table_schema, table_name FROM information_schema.tables WHERE table_name ILIKE '%drizzle%' AND table_schema NOT IN ('pg_catalog','information_schema')");

  const dbTables = tables.map(t => t.tablename);
  const extraTables = dbTables.filter(t => !docTables.has(t));
  const missingTables = [...docTables].filter(t => !dbTables.includes(t));

  const rlsEnabled = tables.filter(t => t.rls);
  const rlsMissingVsDoc = tables.filter(t => !t.rls && docRlsTables.has(t.tablename));
  const rlsExtraVsDoc = tables.filter(t => t.rls && !docRlsTables.has(t.tablename));

  const polByTable = {};
  for (const p of policies) {
    (polByTable[p.tablename] = polByTable[p.tablename] || []).push(p);
  }
  const missingPolicies = [];
  const extraPolicies = [];
  for (const t of tables) {
    const expect = docPolicyCmds(t.tablename);
    const have = (polByTable[t.tablename] || []).map(p => p.cmd);
    for (const cmd of expect) {
      if (!have.includes(cmd)) missingPolicies.push({ table: t.tablename, cmd, doc_policy: `${t.tablename}_${cmd.toLowerCase()}` });
    }
    for (const p of (polByTable[t.tablename] || [])) {
      if (!expect.includes(p.cmd)) extraPolicies.push({ table: t.tablename, policy: p.policyname, cmd: p.cmd });
    }
  }

  const out = {
    captured_at: new Date().toISOString(),
    url_kind: which, db_host: host,
    meta: meta[0], drizzle_journal: drizzleJournal,
    auth_fn: authFn, auth_tables_count: authTables.length,
    tables, policies, roles, grants, indexes, rows,
    drift: { extra_tables: extraTables, missing_tables: missingTables, rls_missing_vs_doc: rlsMissingVsDoc.map(t => t.tablename), rls_extra_vs_doc: rlsExtraVsDoc.map(t => t.tablename), missing_policies: missingPolicies, extra_policies: extraPolicies }
  };
  fs.writeFileSync("_temp_audit_before.json", JSON.stringify(out, null, 1));
  console.log("tables=" + dbTables.length + " rls_enabled=" + rlsEnabled.length + " policies=" + policies.length);
  console.log("extra_tables=" + JSON.stringify(extraTables) + " missing_tables=" + JSON.stringify(missingTables));
  console.log("rls_missing=" + JSON.stringify(rlsMissingVsDoc.map(t => t.tablename)));
  console.log("rls_extra=" + JSON.stringify(rlsExtraVsDoc.map(t => t.tablename)));
  console.log("missing_policies=" + JSON.stringify(missingPolicies.map(m => m.table + ":" + m.cmd)));
  console.log("extra_policies=" + JSON.stringify(extraPolicies.map(m => m.table + ":" + m.policy)));
  console.log("auth_fn=" + JSON.stringify(authFn) + " neon_auth_tables=" + authTables.length);
  console.log("roles=" + JSON.stringify(roles.map(r => r.rolname)));
  console.log("current_user=" + meta[0].current_user);
  console.log("grants_authenticated_tables=" + new Set(grants.filter(g => g.grantee === "authenticated").map(g => g.table_name)).size);
  await client.end();
}
main().catch(e => { console.error("AUDIT_FAILED: " + e.message); process.exitCode = 1; });
