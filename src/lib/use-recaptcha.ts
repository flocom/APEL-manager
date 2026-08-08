"use client";

import { useCallback, useEffect } from "react";

/**
 * Charge reCAPTCHA v3 à la demande et fournit un jeton par envoi de
 * formulaire. Sans clé de site — la protection n'étant pas activée — le
 * chargement n'a pas lieu du tout : aucune requête vers Google n'est faite sur
 * un site qui ne s'en sert pas.
 */

const SCRIPT_ID = "recaptcha-v3";

declare global {
  interface Window {
    grecaptcha?: {
      ready: (callback: () => void) => void;
      execute: (siteKey: string, options: { action: string }) => Promise<string>;
    };
  }
}

function attendreGrecaptcha(timeoutMs = 8000) {
  return new Promise<Window["grecaptcha"] | null>((resolve) => {
    const echeance = Date.now() + timeoutMs;
    const tester = () => {
      if (window.grecaptcha?.execute) return resolve(window.grecaptcha);
      if (Date.now() > echeance) return resolve(null);
      window.setTimeout(tester, 100);
    };
    tester();
  });
}

export function useRecaptcha(siteKey: string | null) {
  useEffect(() => {
    if (!siteKey || document.getElementById(SCRIPT_ID)) return;
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(siteKey)}`;
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  }, [siteKey]);

  return useCallback(
    async (action: string): Promise<string | undefined> => {
      if (!siteKey) return undefined;
      const grecaptcha = await attendreGrecaptcha();
      if (!grecaptcha) return undefined;
      return new Promise<string | undefined>((resolve) => {
        grecaptcha.ready(() => {
          grecaptcha
            .execute(siteKey, { action })
            .then(resolve)
            .catch(() => resolve(undefined));
        });
      });
    },
    [siteKey],
  );
}
