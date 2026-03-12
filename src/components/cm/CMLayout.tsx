import { Outlet } from "react-router-dom";
import { CMSidebar } from "./CMSidebar";

export function CMLayout() {
  return (
    <div className="flex min-h-screen">
      <CMSidebar />
      <main className="ml-60 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[960px] px-6 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
