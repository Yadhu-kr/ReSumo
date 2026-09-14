import React from "react";
import { useLocation } from "react-router-dom";
import AuthSwitch from "@/components/ui/auth-switch";

export const AuthPage: React.FC = () => {
  const location = useLocation();
  const isRegisterRoute = location.pathname.includes("register");

  return <AuthSwitch initialMode={isRegisterRoute ? "register" : "login"} />;
};

export default AuthPage;
