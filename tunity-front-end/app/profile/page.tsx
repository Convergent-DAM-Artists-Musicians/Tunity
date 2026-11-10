import type { Metadata } from "next";
import { ProfilePage } from "@/components/profile-page";
import "./profile.css";

export const metadata: Metadata = {
  title: "My profile · Tunity",
  description:
    "Make space for your sound. Your Tunity profile and practice preferences.",
};
export default function Page() {
  return <ProfilePage />;
}
