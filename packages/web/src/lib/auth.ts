import GithubProvider from "next-auth/providers/github";
import type { NextAuthOptions } from "next-auth";

export const authOptions: NextAuthOptions = {
  providers: [
    GithubProvider({
      clientId: process.env["GITHUB_CLIENT_ID"]!,
      clientSecret: process.env["GITHUB_CLIENT_SECRET"]!,
      authorization: { params: { scope: "read:user repo" } },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      if (account?.access_token) {
        token["accessToken"] = account.access_token;
      }
      return token;
    },
    async session({ session, token }) {
      (session as unknown as Record<string, unknown>)["accessToken"] = token["accessToken"];
      return session;
    },
  },
};
