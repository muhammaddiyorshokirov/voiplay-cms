import { Outlet } from "react-router-dom";
import { AdminSidebar } from "./AdminSidebar";

export function AdminLayout() {
  return (
    <div className="flex min-h-screen">
      <AdminSidebar />
      <main className="ml-60 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[960px] px-6 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
