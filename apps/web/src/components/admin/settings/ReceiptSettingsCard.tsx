"use client";

import { useEffect, useState } from "react";
import { Printer } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type ReceiptPaperWidth = "58" | "80";

/** Wire shape returned by /api/admin/print-settings (snake_case, like the DB). */
interface PrintSettingsResponse {
  receipt_store_name: string;
  address: string;
  phone: string;
  company_name: string;
  company_registration: string;
  receipt_footer: string;
  tax_rate_percent: number;
  receipt_paper_width: ReceiptPaperWidth;
  auto_print_enabled: boolean;
}

interface PrintSettingsForm {
  receipt_store_name: string;
  address: string;
  phone: string;
  company_name: string;
  company_registration: string;
  receipt_footer: string;
  /** Kept as text so the field can be cleared while typing. */
  tax_rate_percent: string;
  receipt_paper_width: ReceiptPaperWidth;
  auto_print_enabled: boolean;
}

function toForm(settings: PrintSettingsResponse): PrintSettingsForm {
  return {
    receipt_store_name: settings.receipt_store_name ?? "",
    address: settings.address ?? "",
    phone: settings.phone ?? "",
    company_name: settings.company_name ?? "",
    company_registration: settings.company_registration ?? "",
    receipt_footer: settings.receipt_footer ?? "",
    tax_rate_percent: String(settings.tax_rate_percent ?? 0),
    receipt_paper_width: settings.receipt_paper_width === "58" ? "58" : "80",
    auto_print_enabled: settings.auto_print_enabled !== false,
  };
}

export function ReceiptSettingsCard() {
  const [settings, setSettings] = useState<PrintSettingsForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const res = await fetch("/api/admin/print-settings", {
          cache: "no-store",
        });
        const data = (await res.json().catch(() => null)) as
          | (PrintSettingsResponse & { error?: string })
          | null;
        if (!res.ok || !data) {
          throw new Error(data?.error ?? "Failed to load receipt settings");
        }
        if (!active) return;
        setSettings(toForm(data));
        setError(null);
      } catch {
        if (active) setError("Failed to load receipt settings");
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, []);

  const update = <K extends keyof PrintSettingsForm>(
    key: K,
    value: PrintSettingsForm[K]
  ) => {
    if (!settings) return;
    setSettings({ ...settings, [key]: value });
    // Any edit makes a previous "saved" confirmation stale.
    setSuccess(false);
  };

  const handleSave = async () => {
    if (!settings || saving) return;

    const rawRate = settings.tax_rate_percent.trim();
    const taxRate = Number(rawRate);
    if (rawRate === "" || !Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) {
      setSuccess(false);
      setError("SST rate must be a number between 0 and 100");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const res = await fetch("/api/admin/print-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receipt_store_name: settings.receipt_store_name,
          address: settings.address,
          phone: settings.phone,
          company_name: settings.company_name,
          company_registration: settings.company_registration,
          receipt_footer: settings.receipt_footer,
          tax_rate_percent: taxRate,
          receipt_paper_width: settings.receipt_paper_width,
          auto_print_enabled: settings.auto_print_enabled,
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | {
            success?: boolean;
            settings?: PrintSettingsResponse;
            error?: string;
          }
        | null;
      if (!res.ok) {
        throw new Error(data?.error ?? "Failed to save receipt settings");
      }
      if (data?.settings) setSettings(toForm(data.settings));
      setSuccess(true);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to save receipt settings"
      );
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

  if (!settings) {
    return (
      <Card className="bg-card border-border shadow-sm rounded-xl">
        <CardHeader>
          <CardTitle className="font-display flex items-center gap-2">
            <Printer className="h-5 w-5" />
            Receipt printing
          </CardTitle>
          <CardDescription>
            Store identity and printer behaviour for paper receipts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-red-500">
            {error ?? "Failed to load receipt settings"}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card border-border shadow-sm rounded-xl">
      <CardHeader>
        <CardTitle className="font-display flex items-center gap-2">
          <Printer className="h-5 w-5" />
          Receipt printing
        </CardTitle>
        <CardDescription>
          Store identity and printer behaviour for kitchen dockets and paper
          receipts.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="receipt-store-name">Name on receipt</Label>
            <Input
              id="receipt-store-name"
              value={settings.receipt_store_name}
              maxLength={80}
              onChange={(e) =>
                update("receipt_store_name", e.target.value)
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="receipt-phone">Phone</Label>
            <Input
              id="receipt-phone"
              value={settings.phone}
              maxLength={30}
              onChange={(e) => update("phone", e.target.value)}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="receipt-address">Address</Label>
            <Input
              id="receipt-address"
              value={settings.address}
              maxLength={200}
              onChange={(e) => update("address", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="receipt-company-name">Company name</Label>
            <Input
              id="receipt-company-name"
              value={settings.company_name}
              maxLength={80}
              onChange={(e) => update("company_name", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="receipt-company-registration">
              Company registration
            </Label>
            <Input
              id="receipt-company-registration"
              value={settings.company_registration}
              maxLength={40}
              onChange={(e) =>
                update("company_registration", e.target.value)
              }
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="receipt-footer">Footer line</Label>
            <Input
              id="receipt-footer"
              value={settings.receipt_footer}
              maxLength={120}
              placeholder="Leave empty to hide the footer"
              onChange={(e) => update("receipt_footer", e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="receipt-tax-rate">SST rate (%)</Label>
            <Input
              id="receipt-tax-rate"
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={settings.tax_rate_percent}
              onChange={(e) =>
                update("tax_rate_percent", e.target.value)
              }
            />
            <p className="text-sm text-muted-foreground">
              SST already included in menu prices. Set 0 to hide the tax row.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Paper width</Label>
            <Select
              value={settings.receipt_paper_width}
              onValueChange={(value) =>
                update(
                  "receipt_paper_width",
                  value === "58" ? "58" : "80"
                )
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Paper width" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="58">58 mm (32 characters)</SelectItem>
                <SelectItem value="80">80 mm (48 characters)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <Label htmlFor="receipt-auto-print">
              Print automatically when an order arrives
            </Label>
            <p className="text-sm text-muted-foreground">
              Sends the kitchen docket and receipt to the printer without
              anyone tapping print.
            </p>
          </div>
          <Switch
            id="receipt-auto-print"
            checked={settings.auto_print_enabled}
            onCheckedChange={(checked) =>
              update("auto_print_enabled", checked)
            }
          />
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}
        {success && (
          <p className="text-sm text-emerald-500">Receipt settings saved</p>
        )}

        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save receipt settings"}
        </Button>
      </CardContent>
    </Card>
  );
}
