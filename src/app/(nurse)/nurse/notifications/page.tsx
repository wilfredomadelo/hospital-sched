import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { markNotificationRead } from "@/app/actions/leave";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function NotificationsPage() {
  const session = await requireSession();

  const notifications = await prisma.notification.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold">Notifications</h2>
        <p className="text-sm text-slate-600">
          Schedule updates and leave decisions.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Inbox</CardTitle>
        </CardHeader>
        <CardContent>
          {notifications.length === 0 ? (
            <p className="text-sm text-slate-500">No notifications yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {notifications.map((n) => (
                <li
                  key={n.id}
                  className={`flex flex-wrap items-start justify-between gap-3 py-4 ${
                    n.readAt ? "opacity-70" : ""
                  }`}
                >
                  <div>
                    <p className="font-medium">{n.title}</p>
                    <p className="text-sm text-slate-600">{n.body}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      {format(n.createdAt, "MMM d, yyyy HH:mm")}
                    </p>
                  </div>
                  {!n.readAt ? (
                    <form action={markNotificationRead}>
                      <input type="hidden" name="id" value={n.id} />
                      <Button type="submit" size="sm" variant="secondary">
                        Mark read
                      </Button>
                    </form>
                  ) : (
                    <span className="text-xs text-slate-400">Read</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
