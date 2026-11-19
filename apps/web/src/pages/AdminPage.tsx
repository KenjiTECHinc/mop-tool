import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { api, type AuditEvent, type Metrics } from "../api/client.ts";
import { Button } from "../components/atoms/Button.tsx";
import { Select } from "../components/atoms/Select.tsx";
import { Tabs } from "../components/atoms/Tabs.tsx";
import { TextField } from "../components/atoms/TextField.tsx";
import { ChatComposer } from "../components/organisms/ChatComposer.tsx";
import { ChatThread } from "../components/organisms/ChatThread.tsx";
import { MembershipForm } from "../components/organisms/MembershipForm.tsx";
import { MetricCard } from "../components/organisms/MetricCard.tsx";
import { useChat } from "../chat/useChat.ts";
import { useSession } from "../context/SessionContext.tsx";
import type { Me } from "../types.ts";

export function AdminPage() {
  const { t, i18n } = useTranslation();
  const { me } = useSession();
  const [tab, setTab] = useState("users");
  const [users, setUsers] = useState<Me["user"][]>([]);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [password, setPassword] = useState("");
  const [projectId, setProjectId] = useState("");
  const [memberId, setMemberId] = useState("");
  const [form, setForm] = useState({ email: "", name: "", jobTitle: "", tier: "T3" });
  const chat = useChat("/admin/ai/insights");

  function load() {
    Promise.all([api.users(), api.audit({}), api.metrics()])
      .then(([userResult, auditResult, metricResult]) => {
        setUsers(userResult.users);
        setEvents(auditResult.events);
        setMetrics(metricResult);
        setProjectId((current) => current || me?.projects[0]?.projectId || "");
        setMemberId((current) => current || userResult.users[0]?.userId || "");
      })
      .catch(() => undefined);
  }

  useEffect(load, [me]);
  if (!me || me.tier !== "T1") return null;
  const when = new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" });

  async function createUser(event: FormEvent) {
    event.preventDefault();
    const result = await api.createUser({ ...form, preferredLanguage: "en" });
    setPassword(result.temporaryPassword);
    setForm({ email: "", name: "", jobTitle: "", tier: "T3" });
    load();
  }

  return (
    <div className="px-6 py-6">
      <h1>{t("nav.admin")}</h1>
      <div className="mt-4">
        <Tabs
          value={tab}
          onChange={setTab}
          options={[
            { value: "users", label: t("admin.users") },
            { value: "projects", label: t("admin.projects") },
            { value: "audit", label: t("admin.audit") },
            { value: "insights", label: t("admin.insights") },
          ]}
        />
      </div>
      {tab === "users" ? (
        <div className="mt-6">
          <form className="mb-6 grid max-w-[680px] gap-3" onSubmit={(event) => void createUser(event)}>
            <TextField required aria-label={t("admin.email")} placeholder={t("admin.email")} value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
            <TextField required aria-label={t("admin.name")} placeholder={t("admin.name")} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            <TextField required aria-label={t("admin.jobTitle")} placeholder={t("admin.jobTitle")} value={form.jobTitle} onChange={(event) => setForm({ ...form, jobTitle: event.target.value })} />
            <Select aria-label={t("admin.tier")} value={form.tier} onChange={(event) => setForm({ ...form, tier: event.target.value })} options={["T1", "T2", "T3"].map((value) => ({ value, label: value }))} />
            <Button type="submit" className="w-fit">{t("admin.createUser")}</Button>
            {password ? <p>{t("admin.temporary")}: {password}</p> : null}
          </form>
          <ul className="divide-y divide-line">
            {users.map((user) => (
              <li key={user.userId} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <span>{user.name} · {user.jobTitle} · {user.tier}</span>
                <Button size="sm" variant="secondary" onClick={() => void api.patchUser(user.userId, { status: user.status === "disabled" ? "active" : "disabled" }).then(load)}>
                  {user.status === "disabled" ? t("admin.enable") : t("admin.disable")}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {tab === "projects" ? (
        <MembershipForm
          projects={me.projects}
          users={users}
          projectId={projectId}
          userId={memberId}
          onProject={setProjectId}
          onUser={setMemberId}
          onAdd={() => void api.membership(projectId, memberId, true)}
          onRemove={() => void api.membership(projectId, memberId, false)}
        />
      ) : null}
      {tab === "audit" ? (
        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="text-left text-[13px] text-muted">
              <th className="py-2">{t("table.time")}</th>
              <th>{t("admin.actor")}</th>
              <th>{t("table.action")}</th>
              <th>{t("admin.outcome")}</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr key={`${event.timestamp}-${event.action}-${event.resourceId}`} className="border-t border-line">
                <td className="py-2">{when.format(new Date(event.timestamp))}</td>
                <td>{event.actorUserId}</td>
                <td>{event.action}</td>
                <td>{event.outcome}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {tab === "insights" ? (
        <div className="mt-6">
          {metrics ? (
            <div className="mb-6 grid gap-3 sm:grid-cols-4">
              <MetricCard label={t("metrics.acceptance")} value={pct(metrics.acceptanceRate)} />
              <MetricCard label={t("metrics.edit")} value={pct(metrics.editRate)} />
              <MetricCard label={t("metrics.wrong")} value={pct(metrics.wrongActionRate)} />
              <MetricCard label={t("metrics.denied")} value={String(metrics.denied)} />
              <MetricCard label={t("metrics.guardrail")} value={String(metrics.guardrailBlocks)} />
              <MetricCard label={t("metrics.latency")} value={`${metrics.medianLatencyMs} ms`} />
              <MetricCard label={t("metrics.active")} value={String(metrics.weeklyActiveUsers)} />
              <MetricCard label={t("metrics.share")} value={pct(metrics.aiUsageShare)} />
            </div>
          ) : null}
          <ChatThread blocks={chat.blocks} onOpenTicket={() => undefined} onConfirm={(id, body) => void chat.confirm(id, body)} onReject={(id) => void chat.reject(id)} />
          <div className="mt-6">
            <ChatComposer busy={chat.busy} onSend={(message) => void chat.send(message || t("quick.activity"))} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}
