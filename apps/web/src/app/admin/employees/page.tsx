"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Users, Loader2, Pencil, UserX } from "lucide-react";
import { useRoleGuard } from "@/hooks/use-role-guard";

interface Employee {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
}

export default function EmployeesPage() {
  const { hasAccess, isLoading: guardLoading } = useRoleGuard(["admin", "manager"]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!hasAccess) return;

    const fetchEmployees = async () => {
      try {
        const res = await fetch("/api/admin/employees");
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Failed to fetch employees");
        }
        const json = await res.json();
        setEmployees(json.data || []);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };

    fetchEmployees();
  }, [hasAccess]);

  const handleDeactivate = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/employees/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to deactivate employee");
      }
      setEmployees((prev) =>
        prev.map((e) => (e.id === id ? { ...e, is_active: false } : e))
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setDeletingId(null);
    }
  };

  if (guardLoading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!hasAccess) {
    return null;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive/50 bg-card shadow-sm rounded-xl">
        <CardContent className="pt-6">
          <p className="text-destructive text-center">{error}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold font-display flex items-center gap-2">
          <Users className="h-6 w-6" />
          Employees
        </h1>
        <Button asChild className="shadow-gold">
          <Link href="/admin/employees/new">
            <Plus className="h-4 w-4 mr-2" />
            Add Employee
          </Link>
        </Button>
      </div>

      <Card className="bg-card border-border shadow-sm rounded-xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-display">All Staff</CardTitle>
        </CardHeader>
        <CardContent>
          {employees.length === 0 ? (
            <div className="rounded-xl border bg-card p-12 text-center">
              <Users className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">No employees yet</p>
              <Button asChild className="mt-4">
                <Link href="/admin/employees/new">Add Your First Employee</Link>
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employees.map((employee) => (
                    <TableRow key={employee.id}>
                      <TableCell className="font-medium">{employee.name}</TableCell>
                      <TableCell>{employee.email}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {employee.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={employee.is_active ? "default" : "secondary"}
                        >
                          {employee.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="ghost" size="sm" asChild>
                            <Link href={`/admin/employees/${employee.id}`}>
                              <Pencil className="h-4 w-4" />
                            </Link>
                          </Button>
                          {employee.is_active && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeactivate(employee.id)}
                              disabled={deletingId === employee.id}
                            >
                              {deletingId === employee.id ? (
                                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                              ) : (
                                <UserX className="h-4 w-4 text-destructive" />
                              )}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
