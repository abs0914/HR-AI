import { AuthForm } from "@/components/auth-form";
import { Suspense } from "react";

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={null}>
      <AuthForm mode="forgot" />
    </Suspense>
  );
}
