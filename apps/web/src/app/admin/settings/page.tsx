import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { RefreshCw, Activity, AlertTriangle, CheckCircle, XCircle, Clock, ListTodo } from "lucide-react";

async function getHubboPosStatus() {
  const supabase = await getServerClient();
  const { data: settings } = await supabase
    .from("store_settings")
    .select("hubbo_pos_enabled, hubbo_pos_merchant_id, hubbo_pos_location_id, hubbo_pos_health_status, hubbo_pos_circuit_state, hubbo_pos_last_sync_at, hubbo_pos_last_catalog_sync_at, hubbo_pos_last_order_sync_at, hubbo_pos_last_error, hubbo_pos_last_error_at, hubbo_pos_read_only_mode, hubbo_pos_sync_interval_minutes")
    .single();

  const { data: queueStats } = await supabase
    .from("hubbopos_sync_queue")
    .select("status")
    .eq("status", "pending");

  const { data: recentSync } = await supabase
    .from("hubbopos_sync_runs")
    .select("status, completed_at, error_message, queue_flushed, orders_pulled, catalog_synced")
    .order("started_at", { ascending: false })
    .limit(1)
    .single();

  return {
    settings,
    queuePending: queueStats?.length || 0,
    recentSync,
  };
}

export default async function AdminSettingsPage() {
  const supabase = await getServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const role = user?.app_metadata?.role as string | undefined;
  if (!user || role !== 'admin') {
    redirect('/admin');
  }

  const { settings, queuePending, recentSync } = await getHubboPosStatus();

  const isEnabled = settings?.hubbo_pos_enabled;
  const healthStatus = settings?.hubbo_pos_health_status || "unknown";
  const circuitState = settings?.hubbo_pos_circuit_state || "closed";

  const healthColor =
    healthStatus === "healthy"
      ? "bg-emerald-500/20 text-emerald-500 border-emerald-500/50"
      : healthStatus === "degraded"
        ? "bg-amber-500/20 text-amber-500 border-amber-500/50"
        : healthStatus === "unhealthy"
          ? "bg-red-500/20 text-red-500 border-red-500/50"
          : "bg-gray-500/20 text-gray-500 border-gray-500/50";

  const circuitColor =
    circuitState === "closed"
      ? "text-emerald-500"
      : circuitState === "half_open"
        ? "text-amber-500"
        : "text-red-500";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage your store settings</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>General Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Settings configuration coming soon.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>HubboPOS Integration</CardTitle>
          <CardDescription>POS synchronization and connection management</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Status Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Status</span>
              <Badge className={isEnabled ? "bg-emerald-500 text-white" : "bg-gray-500 text-white"}>
                {isEnabled ? "Enabled" : "Disabled"}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Health</span>
              <Badge className={healthColor}>{healthStatus}</Badge>
            </div>
            <div className="flex items-center gap-2">
              <AlertTriangle className={`h-4 w-4 ${circuitColor}`} />
              <span className="text-sm text-muted-foreground">Circuit</span>
              <span className={`text-sm font-medium ${circuitColor}`}>{circuitState}</span>
            </div>
            <div className="flex items-center gap-2">
              <ListTodo className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Queue</span>
              <Badge variant={queuePending > 0 ? "destructive" : "secondary"}>{queuePending}</Badge>
            </div>
          </div>

          {/* Connection Details */}
          {isEnabled && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-secondary/30 rounded-lg">
              <div>
                <p className="text-sm text-muted-foreground">Merchant ID</p>
                <p className="font-mono text-sm">{settings?.hubbo_pos_merchant_id || "Not configured"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Location ID</p>
                <p className="font-mono text-sm">{settings?.hubbo_pos_location_id || "Not set"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Last Sync</p>
                <p className="text-sm">{settings?.hubbo_pos_last_sync_at ? new Date(settings.hubbo_pos_last_sync_at).toLocaleString() : "Never"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Last Catalog Sync</p>
                <p className="text-sm">{settings?.hubbo_pos_last_catalog_sync_at ? new Date(settings.hubbo_pos_last_catalog_sync_at).toLocaleString() : "Never"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Sync Interval</p>
                <p className="text-sm">{settings?.hubbo_pos_sync_interval_minutes || 5} minutes</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Read-Only Mode</p>
                <Badge className={settings?.hubbo_pos_read_only_mode ? "bg-amber-500 text-white" : "bg-gray-500 text-white"}>
                  {settings?.hubbo_pos_read_only_mode ? "Active" : "Inactive"}
                </Badge>
              </div>
            </div>
          )}

          {/* Last Error */}
          {settings?.hubbo_pos_last_error && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <XCircle className="h-4 w-4 text-red-500" />
                <p className="text-sm font-medium text-red-500">Last Error</p>
              </div>
              <p className="text-sm text-red-400">{settings.hubbo_pos_last_error}</p>
              {settings.hubbo_pos_last_error_at && (
                <p className="text-xs text-muted-foreground mt-1">
                  {new Date(settings.hubbo_pos_last_error_at).toLocaleString()}
                </p>
              )}
            </div>
          )}

          {/* Recent Sync */}
          {recentSync && (
            <div className="p-4 bg-secondary/30 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-medium">Most Recent Sync</p>
                <Badge className={recentSync.status === "completed" ? "bg-emerald-500 text-white" : "bg-red-500 text-white"}>
                  {recentSync.status}
                </Badge>
              </div>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Catalog Synced</p>
                  <p>{recentSync.catalog_synced ? "Yes" : "No"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Orders Pulled</p>
                  <p>{recentSync.orders_pulled || 0}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Queue Flushed</p>
                  <p>{recentSync.queue_flushed || 0}</p>
                </div>
              </div>
              {recentSync.error_message && (
                <p className="text-xs text-red-400 mt-2">{recentSync.error_message}</p>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <HubboPosTestConnectionButton />
            <HubboPosSyncNowButton />
          </div>

          {/* API Logs Link */}
          <div className="pt-2">
            <Button variant="outline" size="sm" asChild>
              <a href="/admin/settings?tab=logs">View API Logs</a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function HubboPosTestConnectionButton() {
  return (
    <form action={async () => {
      "use server";
      // Client-side will call /api/admin/hubbopos/test-connection
    }}>
      <Button type="submit" variant="outline" size="sm" className="gap-2">
        <RefreshCw className="h-4 w-4" />
        Test Connection
      </Button>
    </form>
  );
}

function HubboPosSyncNowButton() {
  return (
    <form action={async () => {
      "use server";
      // Client-side will call /api/admin/hubbopos/sync
    }}>
      <Button type="submit" variant="default" size="sm" className="gap-2">
        <RefreshCw className="h-4 w-4" />
        Full Sync Now
      </Button>
    </form>
  );
}
