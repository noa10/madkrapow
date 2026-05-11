"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Bot, MessageCircle, MessageSquare, MapPin } from "lucide-react";

interface BotSettings {
  telegramBotEnabled: boolean;
  whatsappBotEnabled: boolean;
  telegramKitchenGroupChatId: string | null;
  deliveryGeofenceJson: string | null;
}

export function BotSettingsSection() {
  const [settings, setSettings] = useState<BotSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetch("/api/admin/bot-settings")
      .then((res) => res.json())
      .then((data) => {
        setSettings(data);
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load bot settings");
        setLoading(false);
      });
  }, []);

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const res = await fetch("/api/admin/bot-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          telegramBotEnabled: settings.telegramBotEnabled,
          whatsappBotEnabled: settings.whatsappBotEnabled,
          telegramKitchenGroupChatId: settings.telegramKitchenGroupChatId || null,
          deliveryGeofenceJson: settings.deliveryGeofenceJson || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to save");
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card className="bg-card border-border shadow-sm rounded-xl">
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-muted rounded w-1/3" />
            <div className="h-8 bg-muted rounded" />
            <div className="h-8 bg-muted rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!settings) return null;

  return (
    <Card className="bg-card border-border shadow-sm rounded-xl">
      <CardHeader>
        <CardTitle className="font-display flex items-center gap-2">
          <Bot className="h-5 w-5" />
          Bot Ordering
        </CardTitle>
        <CardDescription>Configure Telegram and WhatsApp ordering bots</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Telegram */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <MessageCircle className="h-5 w-5 text-blue-500" />
            <div>
              <Label>Telegram Bot</Label>
              <p className="text-sm text-muted-foreground">Enable ordering via Telegram</p>
            </div>
          </div>
          <Switch
            checked={settings.telegramBotEnabled}
            onCheckedChange={(v) => setSettings({ ...settings, telegramBotEnabled: v })}
          />
        </div>

        {/* WhatsApp */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <MessageSquare className="h-5 w-5 text-green-500" />
            <div>
              <Label>WhatsApp Bot</Label>
              <p className="text-sm text-muted-foreground">Enable ordering via WhatsApp</p>
            </div>
          </div>
          <Switch
            checked={settings.whatsappBotEnabled}
            onCheckedChange={(v) => setSettings({ ...settings, whatsappBotEnabled: v })}
          />
        </div>

        {/* Kitchen Group Chat ID */}
        <div className="space-y-2">
          <Label htmlFor="kitchen-chat-id" className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4" />
            Kitchen Telegram Group Chat ID
          </Label>
          <Input
            id="kitchen-chat-id"
            value={settings.telegramKitchenGroupChatId || ""}
            onChange={(e) => setSettings({ ...settings, telegramKitchenGroupChatId: e.target.value || null })}
            placeholder="-1001234567890"
          />
          <p className="text-xs text-muted-foreground">
            Group chat ID for kitchen notifications when bot orders are paid
          </p>
        </div>

        {/* Geofence */}
        <div className="space-y-2">
          <Label htmlFor="geofence" className="flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            Delivery Geofence (GeoJSON Polygon)
          </Label>
          <Textarea
            id="geofence"
            value={settings.deliveryGeofenceJson || ""}
            onChange={(e) => setSettings({ ...settings, deliveryGeofenceJson: e.target.value || null })}
            placeholder='{"type":"Polygon","coordinates":[[[101.524,3.15],[101.536,3.15],[101.536,3.162],[101.524,3.162],[101.524,3.15]]]}'
            rows={4}
          />
          <p className="text-xs text-muted-foreground">
            GeoJSON Polygon defining the delivery zone. Leave empty to allow all addresses.
          </p>
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}
        {success && <p className="text-sm text-emerald-500">Settings saved successfully</p>}

        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Bot Settings"}
        </Button>
      </CardContent>
    </Card>
  );
}
