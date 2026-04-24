import { Boxes, LayoutDashboard, Package, Tag, Warehouse, ArrowLeftRight, BarChart3, Users, ShieldCheck, ScrollText, Bell, Settings, ClipboardCheck, Layers, MessageSquare } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/contexts/AuthContext";

const mainItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Items", url: "/items", icon: Package },
  { title: "Categories", url: "/categories", icon: Tag },
  { title: "Warehouses", url: "/warehouses", icon: Warehouse },
  { title: "Stock", url: "/stock", icon: Layers },
  { title: "Movements", url: "/movements", icon: ArrowLeftRight },
  { title: "Requests", url: "/requests", icon: ClipboardCheck },
  { title: "Chat", url: "/chat", icon: MessageSquare },
  { title: "Analytics", url: "/analytics", icon: BarChart3 },
  { title: "Notifications", url: "/notifications", icon: Bell },
];

const adminItems = [
  { title: "Users & Roles", url: "/admin/users", icon: Users },
  { title: "Audit Log", url: "/admin/audit", icon: ScrollText },
  { title: "Settings", url: "/admin/settings", icon: Settings },
];

export const AppSidebar = () => {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { hasRole } = useAuth();
  const isAdmin = hasRole("admin");

  const isActive = (path: string) =>
    path === "/" ? location.pathname === "/" : location.pathname.startsWith(path);

  const linkCls = (active: boolean) =>
    `flex items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors ${
      active
        ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
        : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
    }`;

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="border-b border-sidebar-border p-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-brand shadow-glow">
            <Boxes className="h-4 w-4 text-primary-foreground" />
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-sm font-bold leading-tight">Stockwise</span>
              <span className="text-[10px] text-sidebar-foreground/60 leading-tight">Inventory OS</span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainItems.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild tooltip={item.title}>
                    <NavLink to={item.url} className={linkCls(isActive(item.url))} end={item.url === "/"}>
                      <item.icon className="h-4 w-4 shrink-0" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel className="flex items-center gap-1">
              <ShieldCheck className="h-3 w-3" /> Admin
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminItems.map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild tooltip={item.title}>
                      <NavLink to={item.url} className={linkCls(isActive(item.url))}>
                        <item.icon className="h-4 w-4 shrink-0" />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
    </Sidebar>
  );
};
