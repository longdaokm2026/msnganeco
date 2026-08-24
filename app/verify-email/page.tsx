"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type VerificationState =
  | { status: "loading"; message: string }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

export default function VerifyEmailPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const initialState = useMemo<VerificationState>(() => {
    if (!token) {
      return {
        status: "error",
        message: "Liên kết xác thực không hợp lệ.",
      };
    }

    return {
      status: "loading",
      message: "Đang xác thực email...",
    };
  }, [token]);

  const [state, setState] = useState<VerificationState>(initialState);

  useEffect(() => {
    if (!token) {
      return;
    }

    const apiUrl =
      process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

    const controller = new AbortController();

    void fetch(`${apiUrl}/auth/verify-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token }),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => null);

          throw new Error(
            body?.message ?? "Mã xác thực không hợp lệ hoặc đã hết hạn.",
          );
        }

        setState({
          status: "success",
          message: "Email đã được xác thực thành công.",
        });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setState({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "Không thể xác thực email.",
        });
      });

    return () => {
      controller.abort();
    };
  }, [token]);

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "24px",
      }}
    >
      <div
        style={{
          maxWidth: "520px",
          width: "100%",
          textAlign: "center",
        }}
      >
        <h1>Xác thực email</h1>

        <p>{state.message}</p>

        {state.status === "success" && (
          <p>
            <Link href="/">Quay lại trang đăng nhập</Link>
          </p>
        )}
      </div>
    </main>
  );
}
