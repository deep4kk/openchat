import Link from "next/link";
import type { Account } from "@prisma/client";

export function Topbar({ account }: { account: Account }) {
  return (
    <header className="topbar">
      <Link href="/dashboard" className="brand">
        Auto<span>DM</span>
      </Link>
      <div className="row">
        {account.profilePicture && <img className="avatar" src={account.profilePicture} alt="" />}
        <span className="small">@{account.username}</span>
        <form action="/api/auth/logout" method="post">
          <button className="btn btn-sm">Log out</button>
        </form>
      </div>
    </header>
  );
}
