"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      let refreshing = false;

      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (refreshing) {
          return;
        }

        refreshing = true;
        window.location.reload();
      });

      navigator.serviceWorker
        .register("/sw.js")
        .then((registration) => {
          registration.update();

          setInterval(
            () => {
              registration.update();
            },
            60 * 60 * 1000,
          );
        })
        .catch(() => {
          // The app still works normally if service worker registration fails.
        });
    }
  }, []);

  return null;
}
