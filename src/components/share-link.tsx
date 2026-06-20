"use client";

import { QrCode, Share2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";

import { Button, Input } from "@/components/ui";

export function ShareLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const [showQR, setShowQR] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard indisponible (webview…) : le champ reste sélectionnable manuellement.
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function share() {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: "Inscription bénévole", url });
      } catch {
        // partage annulé : on ne fait rien.
      }
    } else {
      copy();
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className="font-mono text-xs"
        />
        <Button variant="outline" size="sm" onClick={copy} className="shrink-0">
          {copied ? "Copié ✓" : "Copier le lien"}
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" icon={Share2} onClick={share}>
          Partager
        </Button>
        <Button
          variant="outline"
          size="sm"
          icon={QrCode}
          onClick={() => setShowQR((v) => !v)}
        >
          {showQR ? "Masquer le QR code" : "QR code"}
        </Button>
      </div>
      {showQR && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-slate-200 bg-white p-4">
          <QRCodeSVG value={url} size={180} />
          <p className="text-xs text-slate-500">
            Scannez ou imprimez ce QR code pour partager le lien.
          </p>
        </div>
      )}
    </div>
  );
}
