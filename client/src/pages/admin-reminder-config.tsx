import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Edit, Trash2, Plus, Mail, MessageSquare, AlertCircle, Info } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { ReminderConfiguration, InsertReminderConfiguration } from "@shared/schema";
import { z } from "zod";

const reminderTypeLabels = {
  hostel_fee: "Hostel Fee Reminders",
  remaining_fee: "Remaining Fee Reminders",
};

export default function AdminReminderConfig() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"hostel_fee" | "remaining_fee">("hostel_fee");
  const [editDialog, setEditDialog] = useState<{
    open: boolean;
    config: ReminderConfiguration | null;
  }>({ open: false, config: null });
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    config: ReminderConfiguration | null;
  }>({ open: false, config: null });

  // Form state
  const [reminderType, setReminderType] = useState<"hostel_fee" | "remaining_fee">("hostel_fee");
  const [daysBeforeDue, setDaysBeforeDue] = useState<string>("");
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailTemplate, setEmailTemplate] = useState("");
  const [smsTemplate, setSmsTemplate] = useState("");
  const [isActive, setIsActive] = useState(true);

  const { data: hostelFeeReminders, isLoading: hostelLoading } = useQuery<ReminderConfiguration[]>({
    queryKey: ["/api/admin/reminder-configs", "hostel_fee"],
    queryFn: async () => {
      const response = await fetch("/api/admin/reminder-configs?reminderType=hostel_fee", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch reminders");
      return response.json();
    },
  });

  const { data: remainingFeeReminders, isLoading: remainingLoading } = useQuery<ReminderConfiguration[]>({
    queryKey: ["/api/admin/reminder-configs", "remaining_fee"],
    queryFn: async () => {
      const response = await fetch("/api/admin/reminder-configs?reminderType=remaining_fee", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch reminders");
      return response.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: InsertReminderConfiguration) => {
      return await apiRequest("POST", "/api/admin/reminder-configs", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/reminder-configs"] });
      toast({ title: "Reminder configuration created successfully" });
      resetForm();
      setEditDialog({ open: false, config: null });
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to create reminder configuration", 
        variant: "destructive" 
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<InsertReminderConfiguration> }) => {
      return await apiRequest("PATCH", `/api/admin/reminder-configs/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/reminder-configs"] });
      toast({ title: "Reminder configuration updated successfully" });
      resetForm();
      setEditDialog({ open: false, config: null });
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to update reminder configuration", 
        variant: "destructive" 
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/admin/reminder-configs/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/reminder-configs"] });
      toast({ title: "Reminder configuration deleted" });
      setDeleteDialog({ open: false, config: null });
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to delete reminder configuration", 
        variant: "destructive" 
      });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      return await apiRequest("PATCH", `/api/admin/reminder-configs/${id}`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/reminder-configs"] });
      toast({ title: "Status updated" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to update status", 
        variant: "destructive" 
      });
    },
  });

  const handleOpenCreateDialog = () => {
    resetForm();
    setReminderType(activeTab);
    setEditDialog({ open: true, config: null });
  };

  const handleOpenEditDialog = (config: ReminderConfiguration) => {
    setReminderType(config.reminderType as "hostel_fee" | "remaining_fee");
    setDaysBeforeDue(config.daysBeforeDue.toString());
    setEmailEnabled(config.emailEnabled);
    setSmsEnabled(config.smsEnabled);
    setEmailSubject(config.emailSubject);
    setEmailTemplate(config.emailTemplate);
    setSmsTemplate(config.smsTemplate);
    setIsActive(config.isActive);
    setEditDialog({ open: true, config });
  };

  const handleSubmit = () => {
    if (!daysBeforeDue || daysBeforeDue === "") {
      toast({ title: "Error", description: "Days before due is required", variant: "destructive" });
      return;
    }

    if (emailEnabled && (!emailSubject.trim() || !emailTemplate.trim())) {
      toast({ title: "Error", description: "Email subject and template are required when email is enabled", variant: "destructive" });
      return;
    }

    if (smsEnabled && !smsTemplate.trim()) {
      toast({ title: "Error", description: "SMS template is required when SMS is enabled", variant: "destructive" });
      return;
    }

    if (smsTemplate.length > 160) {
      toast({ title: "Error", description: "SMS template must be 160 characters or less", variant: "destructive" });
      return;
    }

    const data: InsertReminderConfiguration = {
      reminderType,
      daysBeforeDue: parseInt(daysBeforeDue),
      emailEnabled,
      smsEnabled,
      emailSubject: emailSubject || "Reminder",
      emailTemplate: emailTemplate || "Default template",
      smsTemplate: smsTemplate || "Default SMS",
      isActive,
    };

    if (editDialog.config) {
      updateMutation.mutate({ id: editDialog.config.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const resetForm = () => {
    setDaysBeforeDue("");
    setEmailEnabled(true);
    setSmsEnabled(false);
    setEmailSubject("");
    setEmailTemplate("");
    setSmsTemplate("");
    setIsActive(true);
  };

  const renderReminderList = (reminders: ReminderConfiguration[] | undefined, loading: boolean) => {
    if (loading) {
      return (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground">Loading reminders...</p>
          </CardContent>
        </Card>
      );
    }

    if (!reminders || reminders.length === 0) {
      return (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground">No reminder configurations yet</p>
            <Button 
              onClick={handleOpenCreateDialog} 
              className="mt-4"
              data-testid="button-create-first-reminder"
            >
              <Plus className="h-4 w-4 mr-2" />
              Create First Reminder
            </Button>
          </CardContent>
        </Card>
      );
    }

    return (
      <div className="space-y-4">
        {reminders.map((config) => (
          <Card key={config.id} data-testid={`card-reminder-${config.id}`}>
            <CardContent className="p-6">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="font-semibold">
                      {config.daysBeforeDue > 0 && `${config.daysBeforeDue} days before due`}
                      {config.daysBeforeDue === 0 && "On due date"}
                      {config.daysBeforeDue < 0 && `${Math.abs(config.daysBeforeDue)} days overdue`}
                    </h3>
                    {config.isActive ? (
                      <Badge variant="default">Active</Badge>
                    ) : (
                      <Badge variant="secondary">Inactive</Badge>
                    )}
                  </div>

                  <div className="flex gap-4 text-sm text-muted-foreground mb-3">
                    <div className="flex items-center gap-1">
                      <Mail className="h-4 w-4" />
                      {config.emailEnabled ? "Email enabled" : "Email disabled"}
                    </div>
                    <div className="flex items-center gap-1">
                      <MessageSquare className="h-4 w-4" />
                      {config.smsEnabled ? "SMS enabled" : "SMS disabled"}
                    </div>
                  </div>

                  {config.emailEnabled && (
                    <div className="text-sm">
                      <p className="font-medium">Email Subject:</p>
                      <p className="text-muted-foreground">{config.emailSubject}</p>
                    </div>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`active-${config.id}`} className="text-sm">Active</Label>
                    <Switch
                      id={`active-${config.id}`}
                      checked={config.isActive}
                      onCheckedChange={(checked) => 
                        toggleActiveMutation.mutate({ id: config.id, isActive: checked })
                      }
                      data-testid={`switch-active-${config.id}`}
                    />
                  </div>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleOpenEditDialog(config)}
                    data-testid={`button-edit-${config.id}`}
                  >
                    <Edit className="h-4 w-4 mr-1" />
                    Edit
                  </Button>

                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => setDeleteDialog({ open: true, config })}
                    data-testid={`button-delete-${config.id}`}
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Delete
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Reminder Configuration</h1>
          <p className="text-muted-foreground">Manage automated payment reminders</p>
        </div>
        <Button onClick={handleOpenCreateDialog} data-testid="button-create-reminder">
          <Plus className="h-4 w-4 mr-2" />
          Create Reminder
        </Button>
      </div>

      {/* Info Card */}
      <Card className="mb-6 border-blue-200 bg-blue-50 dark:bg-blue-950 dark:border-blue-800">
        <CardContent className="p-4">
          <div className="flex gap-2">
            <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-blue-900 dark:text-blue-100 mb-1">Available Template Variables:</p>
              <p className="text-blue-700 dark:text-blue-300">
                Use {"{studentName}"}, {"{amount}"}, {"{dueDate}"}, {"{paymentLink}"} in your email and SMS templates
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(value: any) => setActiveTab(value)}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="hostel_fee" data-testid="tab-hostel-fee">
            Hostel Fee Reminders
          </TabsTrigger>
          <TabsTrigger value="remaining_fee" data-testid="tab-remaining-fee">
            Remaining Fee Reminders
          </TabsTrigger>
        </TabsList>

        <TabsContent value="hostel_fee" className="mt-6">
          {renderReminderList(hostelFeeReminders, hostelLoading)}
        </TabsContent>

        <TabsContent value="remaining_fee" className="mt-6">
          {renderReminderList(remainingFeeReminders, remainingLoading)}
        </TabsContent>
      </Tabs>

      {/* Create/Edit Dialog */}
      <Dialog 
        open={editDialog.open} 
        onOpenChange={(open) => {
          if (!open) {
            setEditDialog({ open: false, config: null });
            resetForm();
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editDialog.config ? "Edit Reminder Configuration" : "Create Reminder Configuration"}
            </DialogTitle>
            <DialogDescription>
              Configure automated reminders for payment due dates
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="daysBeforeDue">Days Before Due Date *</Label>
              <Input
                id="daysBeforeDue"
                type="number"
                min="-30"
                max="30"
                placeholder="7"
                value={daysBeforeDue}
                onChange={(e) => setDaysBeforeDue(e.target.value)}
                data-testid="input-days-before-due"
              />
              <p className="text-xs text-muted-foreground">
                Positive: Days before due | 0: On due date | Negative: Days after due (overdue)
              </p>
            </div>

            {/* Email Configuration */}
            <div className="space-y-3 border rounded-md p-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="emailEnabled"
                  checked={emailEnabled}
                  onCheckedChange={(checked) => setEmailEnabled(checked as boolean)}
                  data-testid="checkbox-email-enabled"
                />
                <Label htmlFor="emailEnabled" className="flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  Enable Email Reminders
                </Label>
              </div>

              {emailEnabled && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="emailSubject">Email Subject *</Label>
                    <Input
                      id="emailSubject"
                      placeholder="Payment Reminder: {amount} due on {dueDate}"
                      value={emailSubject}
                      onChange={(e) => setEmailSubject(e.target.value)}
                      data-testid="input-email-subject"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="emailTemplate">Email Template *</Label>
                    <Textarea
                      id="emailTemplate"
                      placeholder="Dear {studentName}, your payment of {amount} is due on {dueDate}. Please pay at {paymentLink}"
                      value={emailTemplate}
                      onChange={(e) => setEmailTemplate(e.target.value)}
                      rows={4}
                      data-testid="input-email-template"
                    />
                  </div>
                </>
              )}
            </div>

            {/* SMS Configuration */}
            <div className="space-y-3 border rounded-md p-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="smsEnabled"
                  checked={smsEnabled}
                  onCheckedChange={(checked) => setSmsEnabled(checked as boolean)}
                  data-testid="checkbox-sms-enabled"
                />
                <Label htmlFor="smsEnabled" className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Enable SMS Reminders
                </Label>
              </div>

              {smsEnabled && (
                <div className="space-y-2">
                  <Label htmlFor="smsTemplate">
                    SMS Template * ({smsTemplate.length}/160 characters)
                  </Label>
                  <Textarea
                    id="smsTemplate"
                    placeholder="Hi {studentName}, {amount} due on {dueDate}. Pay at {paymentLink}"
                    value={smsTemplate}
                    onChange={(e) => setSmsTemplate(e.target.value.slice(0, 160))}
                    rows={3}
                    maxLength={160}
                    data-testid="input-sms-template"
                  />
                  {smsTemplate.length > 140 && (
                    <p className="text-xs text-yellow-600 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      Character limit approaching
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Active Status */}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="isActive"
                checked={isActive}
                onCheckedChange={(checked) => setIsActive(checked as boolean)}
                data-testid="checkbox-is-active"
              />
              <Label htmlFor="isActive">
                Activate this reminder configuration
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditDialog({ open: false, config: null });
                resetForm();
              }}
              data-testid="button-cancel-dialog"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
              data-testid="button-submit-reminder"
            >
              {createMutation.isPending || updateMutation.isPending
                ? "Saving..."
                : editDialog.config
                ? "Update"
                : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog 
        open={deleteDialog.open} 
        onOpenChange={(open) => !open && setDeleteDialog({ open: false, config: null })}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Reminder Configuration?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this reminder configuration. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteDialog.config && deleteMutation.mutate(deleteDialog.config.id)}
              className="bg-destructive hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
