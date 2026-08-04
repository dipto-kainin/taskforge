"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    if (token) {
      router.push("/dashboard");
    } else {
      router.push("/login");
    }
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-pulse-glow w-12 h-12 rounded-xl bg-[var(--accent)] flex items-center justify-center">
        <span className="text-white font-bold text-xl">T</span>
      </div>
    </div>
  );
}
