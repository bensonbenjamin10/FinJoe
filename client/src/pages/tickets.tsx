import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { Plus, Ticket, Clock, CheckCircle, XCircle, AlertCircle, MessageSquare } from "lucide-react";
import { format } from "date-fns";
import type { TicketWithDetails } from "@shared/schema";

const createTicketSchema = z.object({
  subject: z.string().min(5, "Subject must be at least 5 characters"),
  description: z.string().min(20, "Please provide more details (at least 20 characters)"),
  priority: z.enum(["low", "medium", "high"]),
  category: z.string().min(1, "Please select a category"),
  registrationId: z.string().optional(),
});

type CreateTicketFormData = z.infer<typeof createTicketSchema>;

export default function Tickets() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedTicket, setSelectedTicket] = useState<TicketWithDetails | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const { data: tickets, isLoading } = useQuery<TicketWithDetails[]>({
    queryKey: ["/api/tickets"],
  });

  const form = useForm<CreateTicketFormData>({
    resolver: zodResolver(createTicketSchema),
    defaultValues: {
      subject: "",
      description: "",
      priority: "medium",
      category: "",
      registrationId: user?.registrationId || "",
    },
  });

  const createTicketMutation = useMutation({
    mutationFn: async (data: CreateTicketFormData) => {
      const response = await apiRequest("POST", "/api/tickets", data);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to create ticket");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
      toast({
        title: "Ticket created",
        description: "Your support ticket has been submitted successfully.",
      });
      form.reset();
      setShowCreateForm(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create ticket",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: CreateTicketFormData) => {
    createTicketMutation.mutate(data);
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: "default" | "secondary" | "destructive" | "outline", icon: any, className?: string }> = {
      open: { variant: "secondary", icon: AlertCircle, className: "bg-blue-600 hover:bg-blue-700 text-white" },
      "in-progress": { variant: "default", icon: Clock, className: "bg-yellow-600 hover:bg-yellow-700 text-white" },
      resolved: { variant: "outline", icon: CheckCircle, className: "bg-green-600 hover:bg-green-700 text-white" },
      closed: { variant: "outline", icon: XCircle },
    };

    const config = variants[status] || variants.open;
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className={config.className} data-testid={`badge-status-${status}`}>
        <Icon className="w-3 h-3 mr-1" />
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  const getPriorityBadge = (priority: string) => {
    const variants: Record<string, string> = {
      low: "bg-gray-500 hover:bg-gray-600 text-white",
      medium: "bg-blue-500 hover:bg-blue-600 text-white",
      high: "bg-orange-500 hover:bg-orange-600 text-white",
      urgent: "bg-red-600 hover:bg-red-700 text-white",
    };

    return (
      <Badge className={variants[priority] || variants.medium} data-testid={`badge-priority-${priority}`}>
        {priority.charAt(0).toUpperCase() + priority.slice(1)}
      </Badge>
    );
  };

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  return (
    <div className="min-h-screen bg-background py-12 px-4">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2" data-testid="text-tickets-title">
              <Ticket className="w-8 h-8 text-primary" />
              Support Tickets
            </h1>
            <p className="text-muted-foreground mt-1">
              Submit and track your support requests
            </p>
          </div>
          <Button
            onClick={() => setShowCreateForm(true)}
            data-testid="button-create-ticket"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Ticket
          </Button>
        </div>

        {/* Create Ticket Form */}
        {showCreateForm && (
          <Card data-testid="card-create-ticket">
            <CardHeader>
              <CardTitle>Create Support Ticket</CardTitle>
              <CardDescription>
                Describe your issue and we'll get back to you as soon as possible
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="subject"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Subject</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Brief description of your issue"
                            {...field}
                            data-testid="input-ticket-subject"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="category"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Category</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-ticket-category">
                              <SelectValue placeholder="Select a category" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="payment">Payment Issue</SelectItem>
                            <SelectItem value="academic">Academic & Registration</SelectItem>
                            <SelectItem value="hostel">Hostel Accommodation</SelectItem>
                            <SelectItem value="technical">Technical Support</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="priority"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Priority</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-ticket-priority">
                              <SelectValue placeholder="Select priority" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="low">Low</SelectItem>
                            <SelectItem value="medium">Medium</SelectItem>
                            <SelectItem value="high">High</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Choose "High" for time-sensitive issues
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Please provide detailed information about your issue..."
                            className="min-h-32"
                            {...field}
                            data-testid="textarea-ticket-description"
                          />
                        </FormControl>
                        <FormDescription>
                          Include all relevant details to help us resolve your issue faster
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex gap-3">
                    <Button
                      type="submit"
                      disabled={createTicketMutation.isPending}
                      data-testid="button-submit-ticket"
                    >
                      {createTicketMutation.isPending ? "Creating..." : "Submit Ticket"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowCreateForm(false)}
                      data-testid="button-cancel-ticket"
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        )}

        {/* Tickets List */}
        {!tickets || tickets.length === 0 ? (
          <Card data-testid="card-no-tickets">
            <CardContent className="py-12 text-center">
              <Ticket className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">No tickets yet</h3>
              <p className="text-muted-foreground mb-4">
                Create your first support ticket to get help from our team
              </p>
              <Button onClick={() => setShowCreateForm(true)} data-testid="button-create-first-ticket">
                <Plus className="w-4 h-4 mr-2" />
                Create Ticket
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {tickets.map((ticket) => (
              <Card
                key={ticket.id}
                className="hover-elevate cursor-pointer"
                onClick={() => setSelectedTicket(ticket)}
                data-testid={`card-ticket-${ticket.id}`}
              >
                <CardHeader>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <CardTitle className="text-lg" data-testid={`text-ticket-subject-${ticket.id}`}>
                        {ticket.subject}
                      </CardTitle>
                      <CardDescription className="mt-1">
                        Created {format(new Date(ticket.createdAt), "MMM dd, yyyy 'at' h:mm a")}
                      </CardDescription>
                    </div>
                    <div className="flex flex-col gap-2 items-end">
                      {getStatusBadge(ticket.status)}
                      {getPriorityBadge(ticket.priority)}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground line-clamp-2" data-testid={`text-ticket-preview-${ticket.id}`}>
                    {ticket.description}
                  </p>
                  {ticket.adminResponse && (
                    <div className="mt-3 flex items-center gap-2 text-sm text-primary">
                      <MessageSquare className="w-4 h-4" />
                      <span>Admin responded</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Ticket Detail Dialog */}
      <Dialog open={!!selectedTicket} onOpenChange={() => setSelectedTicket(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto" data-testid="dialog-ticket-detail">
          {selectedTicket && (
            <>
              <DialogHeader>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <DialogTitle className="text-xl" data-testid="text-ticket-detail-subject">
                      {selectedTicket.subject}
                    </DialogTitle>
                    <DialogDescription className="mt-2">
                      Ticket ID: {selectedTicket.id}
                    </DialogDescription>
                  </div>
                  <div className="flex flex-col gap-2">
                    {getStatusBadge(selectedTicket.status)}
                    {getPriorityBadge(selectedTicket.priority)}
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-6 mt-4">
                {/* Ticket Info */}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Category</p>
                    <p className="font-medium capitalize" data-testid="text-ticket-category">
                      {selectedTicket.category}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Created</p>
                    <p className="font-medium" data-testid="text-ticket-created">
                      {format(new Date(selectedTicket.createdAt), "MMM dd, yyyy 'at' h:mm a")}
                    </p>
                  </div>
                </div>

                {/* Description */}
                <div>
                  <h4 className="font-semibold mb-2">Description</h4>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap" data-testid="text-ticket-description">
                    {selectedTicket.description}
                  </p>
                </div>

                {/* Admin Response */}
                {selectedTicket.adminResponse && (
                  <div className="bg-accent/50 rounded-lg p-4">
                    <h4 className="font-semibold mb-2 flex items-center gap-2">
                      <MessageSquare className="w-4 h-4" />
                      Admin Response
                    </h4>
                    <p className="text-sm whitespace-pre-wrap" data-testid="text-ticket-admin-response">
                      {selectedTicket.adminResponse}
                    </p>
                    {selectedTicket.resolvedAt && (
                      <p className="text-xs text-muted-foreground mt-2">
                        Responded on {format(new Date(selectedTicket.resolvedAt), "MMM dd, yyyy 'at' h:mm a")}
                      </p>
                    )}
                  </div>
                )}

                {!selectedTicket.adminResponse && selectedTicket.status === "open" && (
                  <div className="bg-accent/30 rounded-lg p-4 text-center">
                    <Clock className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      Your ticket is awaiting review. Our team will respond within 24 hours.
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="min-h-screen bg-background py-12 px-4">
      <div className="max-w-6xl mx-auto space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-4 w-48 mt-2" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-16 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
