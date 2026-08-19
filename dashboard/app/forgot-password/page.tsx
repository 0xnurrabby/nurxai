import Navbar from "../components/Navbar";
import ForgotPasswordForm from "./ForgotPasswordForm";

export const metadata = {
  title: "Forgot password - NurAi"
};

export default function ForgotPassword() {
  return (
    <>
      <Navbar />
      <ForgotPasswordForm />
    </>
  );
}
