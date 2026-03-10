import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search, Users, FileText, IndianRupee, Ticket, MessageSquare, AlertCircle, Clock, CheckCircle, XCircle, Building2, Building, Bed, DollarSign, Edit, Trash2, Plus, BarChart3, Download, Filter, Send, Upload, CheckCircle2, Loader2, BookOpen, UserCircle, MapPin, ArrowRight, Star, TrendingUp, Home, CreditCard, Settings, Scale, Receipt, FileCheck, PieChart, Bell, Tag, Gift } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { 
  EnquiryWithProgram, 
  RegistrationWithDetails, 
  TicketWithDetails, 
  Campus, 
  HostelBedType, 
  FeeConfiguration,
  Program,
  InsertCampus,
  InsertHostelBedType,
  InsertFeeConfiguration,
  SelectPromoCode,
  InsertPromoCode
} from "@shared/schema";
import { format } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import SystemSettingsPanel from "@/components/SystemSettingsPanel";
import AdminUsersPanel from "@/components/AdminUsersPanel";
import AdminCampusesEnhanced from "@/pages/admin-campuses-enhanced";

export default function Admin() {
  const [, navigate] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTicket, setSelectedTicket] = useState<TicketWithDetails | null>(null);
  const [adminResponse, setAdminResponse] = useState("");
  const [ticketStatus, setTicketStatus] = useState<string>("");
  const [assignedTo, setAssignedTo] = useState("");
  
  // Campus Management state
  const [hostelBedTypeDialog, setHostelBedTypeDialog] = useState<{ open: boolean; bedType: HostelBedType | null }>({ open: false, bedType: null });
  const [feeConfigDialog, setFeeConfigDialog] = useState<{ open: boolean; config: FeeConfiguration | null }>({ open: false, config: null });
  const [promoCodeDialog, setPromoCodeDialog] = useState<{ open: boolean; promoCode: SelectPromoCode | null }>({ open: false, promoCode: null });
  
  // Payment Management state
  const [paymentFilters, setPaymentFilters] = useState({
    status: "all",
    type: "all",
    campusId: "all",
    startDate: "",
    endDate: "",
  });
  const [manualPaymentDialog, setManualPaymentDialog] = useState(false);
  const [manualPaymentForm, setManualPaymentForm] = useState({
    registrationId: "",
    paymentType: "",
    amount: "",
    description: "",
  });
  
  // Bulk Import state
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<{
    valid: Array<{
      name: string;
      email: string;
      phone: string;
      campus: string;
      program: string;
    }>;
    invalid: Array<{
      row: number;
      errors: string[];
    }>;
    summary: {
      total: number;
      valid: number;
      invalid: number;
    };
  } | null>(null);
  const [importResult, setImportResult] = useState<{
    success: boolean;
    batchId: string;
    imported: number;
    students?: Array<{
      name: string;
      email: string;
      campus: string;
      program: string;
    }>;
    failed?: Array<{
      row: number;
      data?: {
        name?: string;
        email?: string;
      };
      errors: string[];
    }>;
  } | null>(null);
  
  const { toast } = useToast();

  const { data: enquiries, isLoading: enquiriesLoading } = useQuery<EnquiryWithProgram[]>({
    queryKey: ["/api/admin/enquiries"],
  });

  const { data: registrations, isLoading: registrationsLoading } = useQuery<RegistrationWithDetails[]>({
    queryKey: ["/api/admin/registrations"],
  });

  const { data: tickets, isLoading: ticketsLoading } = useQuery<TicketWithDetails[]>({
    queryKey: ["/api/admin/tickets"],
  });

  // Campus Management queries
  const { data: campuses, isLoading: campusesLoading } = useQuery<Campus[]>({
    queryKey: ["/api/campuses"],
  });

  const { data: hostelBedTypes, isLoading: hostelBedTypesLoading } = useQuery<HostelBedType[]>({
    queryKey: ["/api/hostel-bed-types"],
  });

  const { data: feeConfigurations, isLoading: feeConfigurationsLoading } = useQuery<FeeConfiguration[]>({
    queryKey: ["/api/fee-configurations"],
  });

  const { data: programs, isLoading: programsLoading } = useQuery<Program[]>({
    queryKey: ["/api/programs"],
  });

  const { data: promoCodes, isLoading: promoCodesLoading } = useQuery<SelectPromoCode[]>({
    queryKey: ["/api/admin/promo-codes"],
  });

  const { data: enrollmentStats, isLoading: enrollmentStatsLoading } = useQuery<Array<{
    campusId: string;
    totalEnrollments: number;
    paymentCompleted: number;
    paymentPending: number;
  }>>({
    queryKey: ["/api/admin/stats/enrollments"],
  });

  // Payment Management queries
  const buildPaymentQueryParams = () => {
    const params = new URLSearchParams();
    if (paymentFilters.status && paymentFilters.status !== "all") params.append("status", paymentFilters.status);
    if (paymentFilters.type && paymentFilters.type !== "all") params.append("type", paymentFilters.type);
    if (paymentFilters.campusId && paymentFilters.campusId !== "all") params.append("campusId", paymentFilters.campusId);
    if (paymentFilters.startDate) params.append("startDate", paymentFilters.startDate);
    if (paymentFilters.endDate) params.append("endDate", paymentFilters.endDate);
    return params.toString();
  };

  const { data: payments, isLoading: paymentsLoading } = useQuery<Array<any>>({
    queryKey: ["/api/admin/payments", paymentFilters],
    queryFn: async () => {
      const queryParams = buildPaymentQueryParams();
      const url = `/api/admin/payments${queryParams ? `?${queryParams}` : ""}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error("Failed to fetch payments");
      return response.json();
    },
  });

  const { data: collectionsReport, isLoading: collectionsLoading } = useQuery<{
    totalCollections: number;
    totalTransactions: number;
    byType: {
      registration_fee: number;
      remaining_fee: number;
      hostel_fee: number;
    };
  }>({
    queryKey: ["/api/admin/reports/collections", paymentFilters.campusId, paymentFilters.startDate, paymentFilters.endDate],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (paymentFilters.campusId && paymentFilters.campusId !== "all") params.append("campusId", paymentFilters.campusId);
      if (paymentFilters.startDate) params.append("startDate", paymentFilters.startDate);
      if (paymentFilters.endDate) params.append("endDate", paymentFilters.endDate);
      const url = `/api/admin/reports/collections${params.toString() ? `?${params.toString()}` : ""}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error("Failed to fetch collections report");
      return response.json();
    },
  });

  const { data: duesReport, isLoading: duesLoading } = useQuery<Array<{
    registrationId: string;
    studentName: string;
    studentEmail: string;
    studentPhone: string;
    totalDue: number;
    totalPaid: number;
    remainingDue: number;
    registrationDate: string;
  }>>({
    queryKey: ["/api/admin/reports/dues"],
  });

  const completionStepOrder: Record<string, number> = {
    'basic_info': 1,
    'campus_selected': 2,
    'program_selected': 3,
    'completed': 4,
  };

  const filteredEnquiries = enquiries
    ?.filter(
      (enq) =>
        enq.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        enq.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        enq.phone.includes(searchQuery)
    )
    .sort((a, b) => {
      const stepA = completionStepOrder[a.completionStep] || 0;
      const stepB = completionStepOrder[b.completionStep] || 0;
      if (stepA !== stepB) {
        return stepA - stepB;
      }
      return new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime();
    });

  const filteredRegistrations = registrations?.filter(
    (reg) =>
      reg.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      reg.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      reg.phone.includes(searchQuery)
  );

  const filteredTickets = tickets?.filter(
    (ticket) =>
      ticket.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ticket.student?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ticket.category?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const updateTicketMutation = useMutation({
    mutationFn: async (data: { ticketId: string; status: string; adminResponse: string; assignedTo?: string }) => {
      const response = await apiRequest("PATCH", `/api/admin/tickets/${data.ticketId}`, {
        status: data.status,
        adminResponse: data.adminResponse,
        assignedTo: data.assignedTo || null,
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to update ticket");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tickets"] });
      toast({
        title: "Ticket updated",
        description: "The ticket has been updated successfully.",
      });
      setSelectedTicket(null);
      setAdminResponse("");
      setTicketStatus("");
      setAssignedTo("");
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update ticket",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Hostel Bed Type mutations
  const createHostelBedTypeMutation = useMutation({
    mutationFn: async (data: InsertHostelBedType) => {
      const response = await apiRequest("POST", "/api/hostel-bed-types", data);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to create hostel bed type");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hostel-bed-types"] });
      toast({ title: "Hostel bed type created", description: "The hostel bed type has been created successfully." });
      setHostelBedTypeDialog({ open: false, bedType: null });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create hostel bed type", description: error.message, variant: "destructive" });
    },
  });

  const updateHostelBedTypeMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<InsertHostelBedType> }) => {
      const response = await apiRequest("PATCH", `/api/hostel-bed-types/${id}`, data);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to update hostel bed type");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hostel-bed-types"] });
      toast({ title: "Hostel bed type updated", description: "The hostel bed type has been updated successfully." });
      setHostelBedTypeDialog({ open: false, bedType: null });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update hostel bed type", description: error.message, variant: "destructive" });
    },
  });

  const deleteHostelBedTypeMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/hostel-bed-types/${id}`, {});
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to delete hostel bed type");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hostel-bed-types"] });
      toast({ title: "Hostel bed type deleted", description: "The hostel bed type has been deleted successfully." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete hostel bed type", description: error.message, variant: "destructive" });
    },
  });

  // Fee Configuration mutations
  const createFeeConfigMutation = useMutation({
    mutationFn: async (data: InsertFeeConfiguration) => {
      const response = await apiRequest("POST", "/api/fee-configurations", data);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to create fee configuration");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/fee-configurations"] });
      toast({ title: "Fee configuration created", description: "The fee configuration has been created successfully." });
      setFeeConfigDialog({ open: false, config: null });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create fee configuration", description: error.message, variant: "destructive" });
    },
  });

  const updateFeeConfigMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<InsertFeeConfiguration> }) => {
      const response = await apiRequest("PATCH", `/api/fee-configurations/${id}`, data);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to update fee configuration");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/fee-configurations"] });
      toast({ title: "Fee configuration updated", description: "The fee configuration has been updated successfully." });
      setFeeConfigDialog({ open: false, config: null });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update fee configuration", description: error.message, variant: "destructive" });
    },
  });

  const deleteFeeConfigMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/fee-configurations/${id}`, {});
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to delete fee configuration");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/fee-configurations"] });
      toast({ title: "Fee configuration deleted", description: "The fee configuration has been deleted successfully." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete fee configuration", description: error.message, variant: "destructive" });
    },
  });

  // Promo Code mutations
  const createPromoCode = useMutation({
    mutationFn: async (data: InsertPromoCode) => {
      const response = await apiRequest("POST", "/api/admin/promo-codes", data);
      if (!response.ok) throw new Error("Failed to create promo code");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/promo-codes"] });
      setPromoCodeDialog({ open: false, promoCode: null });
      toast({ title: "Promo code created successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updatePromoCode = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<InsertPromoCode> }) => {
      const response = await apiRequest("PATCH", `/api/admin/promo-codes/${id}`, data);
      if (!response.ok) throw new Error("Failed to update promo code");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/promo-codes"] });
      setPromoCodeDialog({ open: false, promoCode: null });
      toast({ title: "Promo code updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deletePromoCode = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/admin/promo-codes/${id}`, {});
      if (!response.ok) throw new Error("Failed to delete promo code");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/promo-codes"] });
      toast({ title: "Promo code deleted successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Payment Management mutations
  const recordManualPaymentMutation = useMutation({
    mutationFn: async (data: { registrationId: string; paymentType: string; amount: number; description?: string }) => {
      const response = await apiRequest("POST", "/api/admin/payments/manual", data);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to record manual payment");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/reports/collections"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/reports/dues"] });
      toast({ title: "Payment recorded", description: "Manual payment has been recorded successfully." });
      setManualPaymentDialog(false);
      setManualPaymentForm({ registrationId: "", paymentType: "", amount: "", description: "" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to record payment", description: error.message, variant: "destructive" });
    },
  });

  const handleManualPaymentSubmit = () => {
    if (!manualPaymentForm.registrationId || !manualPaymentForm.paymentType || !manualPaymentForm.amount) {
      toast({ title: "Validation error", description: "Please fill all required fields", variant: "destructive" });
      return;
    }
    const amount = parseFloat(manualPaymentForm.amount);
    if (isNaN(amount) || amount <= 0) {
      toast({ title: "Validation error", description: "Please enter a valid amount", variant: "destructive" });
      return;
    }
    recordManualPaymentMutation.mutate({
      registrationId: manualPaymentForm.registrationId,
      paymentType: manualPaymentForm.paymentType,
      amount,
      description: manualPaymentForm.description,
    });
  };

  const handleResetFilters = () => {
    setPaymentFilters({ status: "all", type: "all", campusId: "all", startDate: "", endDate: "" });
  };

  const handleExportCSV = () => {
    const queryParams = buildPaymentQueryParams();
    const url = `/api/admin/payments/export${queryParams ? `?${queryParams}` : ""}`;
    window.open(url, "_blank");
  };

  // Bulk Import mutations
  const previewMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/admin/bulk-import/preview", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to preview import");
      }
      return response.json();
    },
    onSuccess: (data) => {
      setPreviewData(data);
    },
    onError: (error: Error) => {
      toast({ title: "Preview failed", description: error.message, variant: "destructive" });
    },
  });

  const importMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/admin/bulk-import/execute", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to execute import");
      }
      return response.json();
    },
    onSuccess: (data) => {
      setImportResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/registrations"] });
    },
    onError: (error: Error) => {
      toast({ title: "Import failed", description: error.message, variant: "destructive" });
    },
  });

  const downloadTemplate = async () => {
    try {
      const response = await fetch("/api/admin/bulk-import/template");
      if (!response.ok) {
        throw new Error("Failed to download template");
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "medpg-bulk-import-template.csv";
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      toast({ title: "Download failed", description: "Failed to download template", variant: "destructive" });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCsvFile(file);
      setPreviewData(null);
      setImportResult(null);
    }
  };

  const handlePreviewImport = () => {
    if (csvFile) {
      previewMutation.mutate(csvFile);
    }
  };

  const handleExecuteImport = () => {
    if (csvFile) {
      importMutation.mutate(csvFile);
    }
  };

  const handleResetBulkImport = () => {
    setCsvFile(null);
    setPreviewData(null);
    setImportResult(null);
  };

  const downloadErrors = (failedRecords: Array<{
    row: number;
    data?: { name?: string; email?: string; };
    errors: string[];
  }>) => {
    const csvContent = [
      ['Row', 'Name', 'Email', 'Errors'].join(','),
      ...failedRecords.map(f => [
        f.row,
        f.data?.name || '',
        f.data?.email || '',
        f.errors.join('; ')
      ].join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'import-errors.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handleTicketClick = (ticket: TicketWithDetails) => {
    setSelectedTicket(ticket);
    setAdminResponse(ticket.adminResponse || "");
    setTicketStatus(ticket.status);
    setAssignedTo(ticket.assignedTo || "");
  };

  const handleUpdateTicket = () => {
    if (!selectedTicket) return;
    updateTicketMutation.mutate({
      ticketId: selectedTicket.id,
      status: ticketStatus,
      adminResponse: adminResponse,
      assignedTo: assignedTo || undefined,
    });
  };

  const stats = {
    totalEnquiries: enquiries?.length || 0,
    totalRegistrations: registrations?.length || 0,
    completedPayments: registrations?.filter((r) => r.paymentStatus === "completed").length || 0,
    pendingPayments: registrations?.filter((r) => r.paymentStatus === "pending").length || 0,
    totalTickets: tickets?.length || 0,
    openTickets: tickets?.filter((t) => t.status === "open").length || 0,
  };

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-2" data-testid="text-admin-title">
            Admin Dashboard
          </h1>
          <p className="text-muted-foreground">
            Manage enquiries and registrations
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card data-testid="card-stat-enquiries">
            <CardContent className="pt-6 pb-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Total Enquiries</p>
                  <p className="text-2xl font-bold">{stats.totalEnquiries}</p>
                </div>
                <FileText className="h-8 w-8 text-primary" />
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-stat-registrations">
            <CardContent className="pt-6 pb-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Registrations</p>
                  <p className="text-2xl font-bold">{stats.totalRegistrations}</p>
                </div>
                <Users className="h-8 w-8 text-primary" />
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-stat-completed">
            <CardContent className="pt-6 pb-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Completed Payments</p>
                  <p className="text-2xl font-bold text-primary">{stats.completedPayments}</p>
                </div>
                <IndianRupee className="h-8 w-8 text-primary" />
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-stat-pending">
            <CardContent className="pt-6 pb-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Pending Payments</p>
                  <p className="text-2xl font-bold text-muted-foreground">{stats.pendingPayments}</p>
                </div>
                <IndianRupee className="h-8 w-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <Card className="mb-6">
          <CardContent className="pt-6 pb-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, or phone..."
                className="pl-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                data-testid="input-search"
              />
            </div>
          </CardContent>
        </Card>

        {/* Main Hub Tabs */}
        <Tabs defaultValue="admissions">
          <TabsList className="mb-6">
            <TabsTrigger value="admissions" data-testid="tab-admissions">
              <Users className="w-4 h-4 mr-2" />
              Admissions
            </TabsTrigger>
            <TabsTrigger value="academics-pricing" data-testid="tab-academics-pricing">
              <Building2 className="w-4 h-4 mr-2" />
              Academics & Pricing
            </TabsTrigger>
            <TabsTrigger value="payments" data-testid="tab-payments">
              <IndianRupee className="w-4 h-4 mr-2" />
              Payments
            </TabsTrigger>
            <TabsTrigger value="content-engagement" data-testid="tab-content-engagement">
              <BookOpen className="w-4 h-4 mr-2" />
              Content & Engagement
            </TabsTrigger>
            <TabsTrigger value="settings" data-testid="tab-settings">
              <Settings className="w-4 h-4 mr-2" />
              Settings
            </TabsTrigger>
          </TabsList>

          {/* ADMISSIONS HUB */}
          <TabsContent value="admissions">
            <Tabs defaultValue="enquiries">
              <TabsList className="mb-6">
                <TabsTrigger value="enquiries" data-testid="tab-enquiries">
                  <FileText className="w-4 h-4 mr-2" />
                  Enquiries ({stats.totalEnquiries})
                </TabsTrigger>
                <TabsTrigger value="registrations" data-testid="tab-registrations">
                  <Users className="w-4 h-4 mr-2" />
                  Registrations ({stats.totalRegistrations})
                </TabsTrigger>
                <TabsTrigger value="bulk-import" data-testid="tab-bulk-import">
                  <Upload className="w-4 h-4 mr-2" />
                  Bulk Import
                </TabsTrigger>
                <TabsTrigger value="tickets" data-testid="tab-tickets">
                  <Ticket className="w-4 h-4 mr-2" />
                  Tickets ({stats.totalTickets})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="enquiries">
                <Card>
                  <CardHeader>
                    <CardTitle>Enquiries</CardTitle>
                    <CardDescription>
                      Enquiries are sorted by completion status (incomplete first) and last updated date
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {enquiriesLoading ? (
                      <div className="text-center py-8 text-muted-foreground">Loading...</div>
                    ) : filteredEnquiries && filteredEnquiries.length > 0 ? (
                      <div className="overflow-x-auto">
                        <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Status</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Phone</TableHead>
                          <TableHead>Campus</TableHead>
                          <TableHead>Program</TableHead>
                          <TableHead>WhatsApp</TableHead>
                          <TableHead>Last Updated</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredEnquiries.map((enquiry) => {
                          const getCompletionBadge = (step: string) => {
                            switch (step) {
                              case 'basic_info':
                                return (
                                  <Badge 
                                    className="bg-yellow-600 hover:bg-yellow-700 text-white"
                                    data-testid={`badge-completion-${enquiry.id}`}
                                  >
                                    Basic Info
                                  </Badge>
                                );
                              case 'campus_selected':
                                return (
                                  <Badge 
                                    className="bg-blue-600 hover:bg-blue-700 text-white"
                                    data-testid={`badge-completion-${enquiry.id}`}
                                  >
                                    Campus Selected
                                  </Badge>
                                );
                              case 'program_selected':
                                return (
                                  <Badge 
                                    className="bg-purple-600 hover:bg-purple-700 text-white"
                                    data-testid={`badge-completion-${enquiry.id}`}
                                  >
                                    Program Selected
                                  </Badge>
                                );
                              case 'completed':
                                return (
                                  <Badge 
                                    className="bg-green-600 hover:bg-green-700 text-white"
                                    data-testid={`badge-completion-${enquiry.id}`}
                                  >
                                    Complete
                                  </Badge>
                                );
                              default:
                                return (
                                  <Badge 
                                    variant="secondary"
                                    data-testid={`badge-completion-${enquiry.id}`}
                                  >
                                    Unknown
                                  </Badge>
                                );
                            }
                          };

                          return (
                            <TableRow key={enquiry.id} data-testid={`row-enquiry-${enquiry.id}`}>
                              <TableCell>
                                {getCompletionBadge(enquiry.completionStep)}
                              </TableCell>
                              <TableCell className="font-medium" data-testid={`text-name-${enquiry.id}`}>
                                {enquiry.name}
                              </TableCell>
                              <TableCell data-testid={`text-email-${enquiry.id}`}>
                                {enquiry.email}
                              </TableCell>
                              <TableCell data-testid={`text-phone-${enquiry.id}`}>
                                {enquiry.phone}
                              </TableCell>
                              <TableCell data-testid={`text-campus-${enquiry.id}`}>
                                {enquiry.campus?.name || <span className="text-muted-foreground">-</span>}
                              </TableCell>
                              <TableCell data-testid={`text-program-${enquiry.id}`}>
                                {enquiry.program?.name || <span className="text-muted-foreground">-</span>}
                              </TableCell>
                              <TableCell data-testid={`icon-whatsapp-${enquiry.id}`}>
                                {enquiry.whatsappSent ? (
                                  <CheckCircle className="h-5 w-5 text-green-600" />
                                ) : (
                                  <Clock className="h-5 w-5 text-muted-foreground" />
                                )}
                              </TableCell>
                              <TableCell className="text-muted-foreground text-sm" data-testid={`text-lastupdated-${enquiry.id}`}>
                                {format(new Date(enquiry.lastUpdated), "MMM dd, yyyy")}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No enquiries found
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="registrations">
            <Card>
              <CardHeader>
                <CardTitle>Registrations</CardTitle>
              </CardHeader>
              <CardContent>
                {registrationsLoading ? (
                  <div className="text-center py-8 text-muted-foreground">Loading...</div>
                ) : filteredRegistrations && filteredRegistrations.length > 0 ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Phone</TableHead>
                          <TableHead>Program</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Payment</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredRegistrations.map((registration) => (
                          <TableRow key={registration.id} data-testid={`row-registration-${registration.id}`}>
                            <TableCell className="font-medium">{registration.name}</TableCell>
                            <TableCell>{registration.email}</TableCell>
                            <TableCell>{registration.phone}</TableCell>
                            <TableCell>
                              {registration.program?.name || <span className="text-muted-foreground">-</span>}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {format(new Date(registration.createdAt), "dd MMM yyyy")}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  registration.paymentStatus === "completed"
                                    ? "default"
                                    : registration.paymentStatus === "failed"
                                    ? "destructive"
                                    : "secondary"
                                }
                              >
                                {registration.paymentStatus}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No registrations found
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tickets">
            <Card>
              <CardHeader>
                <CardTitle>Support Tickets</CardTitle>
              </CardHeader>
              <CardContent>
                {ticketsLoading ? (
                  <div className="text-center py-8 text-muted-foreground">Loading...</div>
                ) : filteredTickets && filteredTickets.length > 0 ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Subject</TableHead>
                          <TableHead>Student</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead>Priority</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredTickets.map((ticket) => (
                          <TableRow key={ticket.id} data-testid={`row-ticket-${ticket.id}`}>
                            <TableCell className="font-medium">{ticket.subject}</TableCell>
                            <TableCell>{ticket.student?.name || "N/A"}</TableCell>
                            <TableCell className="capitalize">{ticket.category}</TableCell>
                            <TableCell>
                              <Badge
                                className={
                                  ticket.priority === "urgent"
                                    ? "bg-red-600 hover:bg-red-700 text-white"
                                    : ticket.priority === "high"
                                    ? "bg-orange-500 hover:bg-orange-600 text-white"
                                    : ticket.priority === "medium"
                                    ? "bg-blue-500 hover:bg-blue-600 text-white"
                                    : "bg-gray-500 hover:bg-gray-600 text-white"
                                }
                              >
                                {ticket.priority}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  ticket.status === "resolved" || ticket.status === "closed"
                                    ? "outline"
                                    : "secondary"
                                }
                                className={
                                  ticket.status === "open"
                                    ? "bg-blue-600 hover:bg-blue-700 text-white"
                                    : ticket.status === "in-progress"
                                    ? "bg-yellow-600 hover:bg-yellow-700 text-white"
                                    : ticket.status === "resolved"
                                    ? "bg-green-600 hover:bg-green-700 text-white"
                                    : ""
                                }
                              >
                                {ticket.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {format(new Date(ticket.createdAt), "dd MMM yyyy")}
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleTicketClick(ticket)}
                                data-testid={`button-respond-${ticket.id}`}
                              >
                                <MessageSquare className="w-4 h-4 mr-1" />
                                Respond
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No tickets found
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

              <TabsContent value="bulk-import">
                <BulkImportTab
                  csvFile={csvFile}
                  previewData={previewData}
                  importResult={importResult}
                  previewLoading={previewMutation.isPending}
                  importLoading={importMutation.isPending}
                  onDownloadTemplate={downloadTemplate}
                  onFileChange={handleFileChange}
                  onPreviewImport={handlePreviewImport}
                  onExecuteImport={handleExecuteImport}
                  onReset={handleResetBulkImport}
                  onDownloadErrors={downloadErrors}
                />
              </TabsContent>
            </Tabs>
          </TabsContent>

          {/* ACADEMICS & PRICING HUB */}
          <TabsContent value="academics-pricing">
            <Tabs defaultValue="campuses">
              <TabsList className="mb-6">
                <TabsTrigger value="campuses" data-testid="tab-campuses">
                  <Building2 className="w-4 h-4 mr-2" />
                  Campuses
                </TabsTrigger>
                <TabsTrigger value="hostel-bed-types" data-testid="tab-hostel-bed-types">
                  <Bed className="w-4 h-4 mr-2" />
                  Hostel Bed Types
                </TabsTrigger>
                <TabsTrigger value="fee-configurations" data-testid="tab-fee-configurations">
                  <DollarSign className="w-4 h-4 mr-2" />
                  Fee Configurations
                </TabsTrigger>
                <TabsTrigger value="promo-codes" data-testid="tab-promo-codes">
                  <Tag className="w-4 h-4 mr-2" />
                  Promo Codes
                </TabsTrigger>
                <TabsTrigger value="referrals" data-testid="tab-referrals" onClick={() => navigate('/admin/referrals')}>
                  <Gift className="w-4 h-4 mr-2" />
                  Referrals
                </TabsTrigger>
                <TabsTrigger value="expenses" data-testid="tab-expenses" onClick={() => navigate('/admin/expenses')}>
                  <Receipt className="w-4 h-4 mr-2" />
                  Expenses
                </TabsTrigger>
                <TabsTrigger value="income" data-testid="tab-income" onClick={() => navigate('/admin/income')}>
                  <TrendingUp className="w-4 h-4 mr-2" />
                  Income
                </TabsTrigger>
                <TabsTrigger value="finjoe" data-testid="tab-finjoe" onClick={() => navigate('/admin/finjoe')}>
                  <MessageSquare className="w-4 h-4 mr-2" />
                  FinJoe
                </TabsTrigger>
                <TabsTrigger value="enrollment-stats" data-testid="tab-enrollment-stats">
                  <BarChart3 className="w-4 h-4 mr-2" />
                  Enrollment Stats
                </TabsTrigger>
              </TabsList>

              <TabsContent value="campuses">
                <AdminCampusesEnhanced />
              </TabsContent>

              <TabsContent value="hostel-bed-types">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>Hostel Bed Types</CardTitle>
                      <Button onClick={() => setHostelBedTypeDialog({ open: true, bedType: null })} data-testid="button-add-hostel-bed-type">
                        <Plus className="w-4 h-4 mr-2" />
                        Add New
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {hostelBedTypesLoading ? (
                      <div className="text-center py-8 text-muted-foreground">Loading...</div>
                    ) : hostelBedTypes && hostelBedTypes.length > 0 ? (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Campus</TableHead>
                              <TableHead>Bed Type</TableHead>
                              <TableHead>Monthly Fee (₹)</TableHead>
                              <TableHead>Total Beds</TableHead>
                              <TableHead>Available Beds</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {hostelBedTypes.map((bedType) => (
                              <TableRow key={bedType.id} data-testid={`row-hostel-bed-type-${bedType.id}`}>
                                <TableCell className="font-medium">
                                  {campuses?.find(c => c.id === bedType.campusId)?.name || bedType.campusId}
                                </TableCell>
                                <TableCell className="capitalize">{bedType.bedType}</TableCell>
                                <TableCell>{bedType.monthlyFee.toLocaleString()}</TableCell>
                                <TableCell>{bedType.totalBeds}</TableCell>
                                <TableCell>{bedType.availableBeds}</TableCell>
                                <TableCell>
                                  <Badge variant={bedType.isActive ? "default" : "secondary"}>
                                    {bedType.isActive ? "Active" : "Inactive"}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  <div className="flex gap-2">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => setHostelBedTypeDialog({ open: true, bedType })}
                                      data-testid={`button-edit-hostel-bed-type-${bedType.id}`}
                                    >
                                      <Edit className="w-4 h-4" />
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => deleteHostelBedTypeMutation.mutate(bedType.id)}
                                      data-testid={`button-delete-hostel-bed-type-${bedType.id}`}
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        No hostel bed types found
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="fee-configurations">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>Fee Configurations</CardTitle>
                      <Button onClick={() => setFeeConfigDialog({ open: true, config: null })} data-testid="button-add-fee-configuration">
                        <Plus className="w-4 h-4 mr-2" />
                        Add New
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {feeConfigurationsLoading ? (
                      <div className="text-center py-8 text-muted-foreground">Loading...</div>
                    ) : feeConfigurations && feeConfigurations.length > 0 ? (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Campus</TableHead>
                              <TableHead>Program</TableHead>
                              <TableHead>Total Fee (₹)</TableHead>
                              <TableHead>Registration Fee (₹)</TableHead>
                              <TableHead>Remaining Fee (₹)</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {feeConfigurations.map((config) => (
                              <TableRow key={config.id} data-testid={`row-fee-configuration-${config.id}`}>
                                <TableCell className="font-medium">
                                  {campuses?.find(c => c.id === config.campusId)?.name || config.campusId}
                                </TableCell>
                                <TableCell>
                                  {programs?.find(p => p.id === config.programId)?.name || config.programId}
                                </TableCell>
                                <TableCell>{config.totalFee.toLocaleString()}</TableCell>
                                <TableCell>{config.registrationFee.toLocaleString()}</TableCell>
                                <TableCell>{config.programFee.toLocaleString()}</TableCell>
                                <TableCell>
                                  <Badge variant={config.isActive ? "default" : "secondary"}>
                                    {config.isActive ? "Active" : "Inactive"}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  <div className="flex gap-2">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => setFeeConfigDialog({ open: true, config })}
                                      data-testid={`button-edit-fee-configuration-${config.id}`}
                                    >
                                      <Edit className="w-4 h-4" />
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => deleteFeeConfigMutation.mutate(config.id)}
                                      data-testid={`button-delete-fee-configuration-${config.id}`}
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        No fee configurations found
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="promo-codes">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>Promo Codes</CardTitle>
                      <Button onClick={() => setPromoCodeDialog({ open: true, promoCode: null })} data-testid="button-add-promo-code">
                        <Plus className="w-4 h-4 mr-2" />
                        Add New
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {promoCodesLoading ? (
                      <div className="text-center py-8 text-muted-foreground">Loading...</div>
                    ) : promoCodes && promoCodes.length > 0 ? (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Code</TableHead>
                              <TableHead>Discount</TableHead>
                              <TableHead>Valid From</TableHead>
                              <TableHead>Valid To</TableHead>
                              <TableHead>Usage</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {promoCodes.map((code) => (
                              <TableRow key={code.id}>
                                <TableCell className="font-mono font-semibold">{code.code}</TableCell>
                                <TableCell>
                                  {code.discountType === "percentage" 
                                    ? `${code.discountValue}%` 
                                    : `₹${code.discountValue.toLocaleString('en-IN')}`}
                                </TableCell>
                                <TableCell>{new Date(code.validFrom).toLocaleDateString('en-IN')}</TableCell>
                                <TableCell>{new Date(code.validTo).toLocaleDateString('en-IN')}</TableCell>
                                <TableCell>
                                  {code.currentUses} {code.maxUses ? `/ ${code.maxUses}` : '/ ∞'}
                                </TableCell>
                                <TableCell>
                                  <Badge variant={code.isActive ? "default" : "secondary"}>
                                    {code.isActive ? "Active" : "Inactive"}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  <div className="flex gap-2">
                                    <Button 
                                      variant="outline" 
                                      size="sm"
                                      onClick={() => setPromoCodeDialog({ open: true, promoCode: code })}
                                      data-testid={`button-edit-promo-code-${code.code}`}
                                    >
                                      <Edit className="w-4 h-4" />
                                    </Button>
                                    <Button 
                                      variant="outline" 
                                      size="sm"
                                      onClick={() => {
                                        if (confirm(`Delete promo code "${code.code}"?`)) {
                                          deletePromoCode.mutate(code.id);
                                        }
                                      }}
                                      data-testid={`button-delete-promo-code-${code.code}`}
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    ) : (
                      <div className="text-center py-12">
                        <Tag className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                        <p className="text-muted-foreground">No promo codes yet</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="enrollment-stats">
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Campus-wise Enrollment Statistics</h3>
                  {enrollmentStatsLoading ? (
                    <div className="text-center py-8 text-muted-foreground">Loading...</div>
                  ) : enrollmentStats && enrollmentStats.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {enrollmentStats.map((stat) => {
                        const campus = campuses?.find(c => c.id === stat.campusId);
                        return (
                          <Card key={stat.campusId} data-testid={`card-enrollment-stat-${stat.campusId}`}>
                            <CardHeader>
                              <CardTitle className="text-lg">{campus?.name || stat.campusId}</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                              <div className="flex items-center justify-between">
                                <span className="text-sm text-muted-foreground">Total Enrollments</span>
                                <span className="text-lg font-bold">{stat.totalEnrollments}</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-sm text-muted-foreground">Payment Completed</span>
                                <span className="text-lg font-bold text-primary">{stat.paymentCompleted}</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-sm text-muted-foreground">Payment Pending</span>
                                <span className="text-lg font-bold text-muted-foreground">{stat.paymentPending}</span>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      No enrollment statistics found
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </TabsContent>

          {/* PAYMENTS HUB */}
          <TabsContent value="payments">
            <Tabs defaultValue="all-payments">
              <TabsList className="mb-6">
                <TabsTrigger value="all-payments" data-testid="tab-all-payments">
                  <Receipt className="w-4 h-4 mr-2" />
                  All Payments
                </TabsTrigger>
                <TabsTrigger value="dues-report" data-testid="tab-dues-report">
                  <AlertCircle className="w-4 h-4 mr-2" />
                  Dues Report
                </TabsTrigger>
                <TabsTrigger value="collections-summary" data-testid="tab-collections-summary">
                  <PieChart className="w-4 h-4 mr-2" />
                  Collections Summary
                </TabsTrigger>
                <TabsTrigger value="manual-payment" data-testid="tab-manual-payment">
                  <CreditCard className="w-4 h-4 mr-2" />
                  Record Payment
                </TabsTrigger>
                <TabsTrigger value="payment-verification" data-testid="tab-payment-verification">
                  <FileCheck className="w-4 h-4 mr-2" />
                  Verification
                </TabsTrigger>
                <TabsTrigger value="reconciliation" data-testid="tab-reconciliation">
                  <BarChart3 className="w-4 h-4 mr-2" />
                  Reconciliation
                </TabsTrigger>
                <TabsTrigger value="reminders" data-testid="tab-reminders">
                  <Bell className="w-4 h-4 mr-2" />
                  Reminders
                </TabsTrigger>
              </TabsList>

            {/* Overview Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <Card data-testid="card-total-collections">
                <CardContent className="pt-6 pb-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Total Collections</p>
                      <p className="text-2xl font-bold">
                        {collectionsLoading ? "..." : `₹${(collectionsReport?.totalCollections || 0).toLocaleString('en-IN')}`}
                      </p>
                    </div>
                    <IndianRupee className="h-8 w-8 text-primary" />
                  </div>
                </CardContent>
              </Card>

              <Card data-testid="card-total-transactions">
                <CardContent className="pt-6 pb-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Total Transactions</p>
                      <p className="text-2xl font-bold">
                        {collectionsLoading ? "..." : collectionsReport?.totalTransactions || 0}
                      </p>
                    </div>
                    <BarChart3 className="h-8 w-8 text-primary" />
                  </div>
                </CardContent>
              </Card>

              <Card data-testid="card-pending-payments">
                <CardContent className="pt-6 pb-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Pending Payments</p>
                      <p className="text-2xl font-bold">
                        {paymentsLoading ? "..." : payments?.filter(p => p.status === 'pending' || p.status === 'failed').length || 0}
                      </p>
                    </div>
                    <Clock className="h-8 w-8 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Filters Section */}
            <Card className="mb-6">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Filter className="h-5 w-5" />
                  <CardTitle>Filters</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <label className="text-sm font-medium mb-2 block">Status</label>
                    <Select
                      value={paymentFilters.status}
                      onValueChange={(value) => setPaymentFilters({ ...paymentFilters, status: value })}
                    >
                      <SelectTrigger data-testid="select-filter-status">
                        <SelectValue placeholder="All statuses" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="captured">Captured</SelectItem>
                        <SelectItem value="failed">Failed</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-2 block">Payment Type</label>
                    <Select
                      value={paymentFilters.type}
                      onValueChange={(value) => setPaymentFilters({ ...paymentFilters, type: value })}
                    >
                      <SelectTrigger data-testid="select-filter-type">
                        <SelectValue placeholder="All types" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="registration_fee">Registration Fee</SelectItem>
                        <SelectItem value="remaining_fee">Remaining Fee</SelectItem>
                        <SelectItem value="hostel_fee">Hostel Fee</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-2 block">Campus</label>
                    <Select
                      value={paymentFilters.campusId}
                      onValueChange={(value) => setPaymentFilters({ ...paymentFilters, campusId: value })}
                    >
                      <SelectTrigger data-testid="select-filter-campus">
                        <SelectValue placeholder="All campuses" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        {campuses?.map((campus) => (
                          <SelectItem key={campus.id} value={campus.id}>
                            {campus.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-2 block">Start Date</label>
                    <Input
                      type="date"
                      value={paymentFilters.startDate}
                      onChange={(e) => setPaymentFilters({ ...paymentFilters, startDate: e.target.value })}
                      data-testid="input-filter-start-date"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-2 block">End Date</label>
                    <Input
                      type="date"
                      value={paymentFilters.endDate}
                      onChange={(e) => setPaymentFilters({ ...paymentFilters, endDate: e.target.value })}
                      data-testid="input-filter-end-date"
                    />
                  </div>

                  <div className="flex items-end gap-2">
                    <Button
                      variant="outline"
                      onClick={handleResetFilters}
                      className="flex-1"
                      data-testid="button-reset-filters"
                    >
                      Reset
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Action Buttons */}
            <div className="flex gap-2 mb-6">
              <Button onClick={() => setManualPaymentDialog(true)} data-testid="button-record-manual-payment">
                <Plus className="w-4 h-4 mr-2" />
                Record Manual Payment
              </Button>
              <Button variant="outline" onClick={handleExportCSV} data-testid="button-export-csv">
                <Download className="w-4 h-4 mr-2" />
                Export CSV
              </Button>
            </div>

              {/* All Payments Tab */}
              <TabsContent value="all-payments">
                <Card>
                  <CardHeader>
                    <CardTitle>All Payments</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {paymentsLoading ? (
                      <div className="text-center py-8 text-muted-foreground">Loading...</div>
                    ) : payments && payments.length > 0 ? (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Student Name</TableHead>
                              <TableHead>Email</TableHead>
                              <TableHead>Payment Type</TableHead>
                              <TableHead>Amount</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Date</TableHead>
                              <TableHead>Razorpay Order ID</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {payments.map((payment) => (
                              <TableRow key={payment.id} data-testid={`row-payment-${payment.id}`}>
                                <TableCell className="font-medium">
                                  {payment.registration?.name || "N/A"}
                                </TableCell>
                                <TableCell>{payment.registration?.email || "N/A"}</TableCell>
                                <TableCell className="capitalize">
                                  {payment.paymentType?.replace(/_/g, ' ')}
                                </TableCell>
                                <TableCell>
                                  ₹{payment.amount.toLocaleString('en-IN')}
                                </TableCell>
                                <TableCell>
                                  <Badge
                                    variant={
                                      payment.status === "captured"
                                        ? "default"
                                        : payment.status === "failed"
                                        ? "destructive"
                                        : "secondary"
                                    }
                                    className={
                                      payment.status === "captured"
                                        ? "bg-green-600 hover:bg-green-700 text-white"
                                        : payment.status === "failed"
                                        ? "bg-red-600 hover:bg-red-700 text-white"
                                        : "bg-yellow-600 hover:bg-yellow-700 text-white"
                                    }
                                    data-testid={`badge-status-${payment.id}`}
                                  >
                                    {payment.status}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-muted-foreground text-sm">
                                  {format(new Date(payment.createdAt), "dd MMM yyyy HH:mm")}
                                </TableCell>
                                <TableCell className="font-mono text-xs">
                                  {payment.razorpayOrderId || "N/A"}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        No payments found
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Dues Report Tab */}
              <TabsContent value="dues-report">
                <Card>
                  <CardHeader>
                    <CardTitle>Students with Pending Dues</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {duesLoading ? (
                      <div className="text-center py-8 text-muted-foreground">Loading...</div>
                    ) : duesReport && duesReport.length > 0 ? (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Student Name</TableHead>
                              <TableHead>Email</TableHead>
                              <TableHead>Phone</TableHead>
                              <TableHead>Total Due</TableHead>
                              <TableHead>Total Paid</TableHead>
                              <TableHead>Remaining Due</TableHead>
                              <TableHead>Registration Date</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {duesReport.map((due) => (
                              <TableRow key={due.registrationId} data-testid={`row-due-${due.registrationId}`}>
                                <TableCell className="font-medium">{due.studentName}</TableCell>
                                <TableCell>{due.studentEmail}</TableCell>
                                <TableCell>{due.studentPhone}</TableCell>
                                <TableCell>
                                  ₹{due.totalDue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </TableCell>
                                <TableCell className="text-primary">
                                  ₹{due.totalPaid.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </TableCell>
                                <TableCell className="font-semibold text-red-600">
                                  ₹{due.remainingDue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </TableCell>
                                <TableCell className="text-muted-foreground text-sm">
                                  {format(new Date(due.registrationDate), "dd MMM yyyy")}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        No pending dues found
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Collections Summary Tab */}
              <TabsContent value="collections-summary">
                <Card>
                  <CardHeader>
                    <CardTitle>Collections Breakdown by Type</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {collectionsLoading ? (
                      <div className="text-center py-8 text-muted-foreground">Loading...</div>
                    ) : collectionsReport ? (
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <Card data-testid="card-registration-fee-collections">
                            <CardContent className="pt-6 pb-6">
                              <div>
                                <p className="text-sm text-muted-foreground mb-1">Registration Fee</p>
                                <p className="text-2xl font-bold">
                                  ₹{(collectionsReport.byType?.registration_fee || 0).toLocaleString('en-IN')}
                                </p>
                              </div>
                            </CardContent>
                          </Card>

                          <Card data-testid="card-remaining-fee-collections">
                            <CardContent className="pt-6 pb-6">
                              <div>
                                <p className="text-sm text-muted-foreground mb-1">Remaining Fee</p>
                                <p className="text-2xl font-bold">
                                  ₹{(collectionsReport.byType?.remaining_fee || 0).toLocaleString('en-IN')}
                                </p>
                              </div>
                            </CardContent>
                          </Card>

                          <Card data-testid="card-hostel-fee-collections">
                            <CardContent className="pt-6 pb-6">
                              <div>
                                <p className="text-sm text-muted-foreground mb-1">Hostel Fee</p>
                                <p className="text-2xl font-bold">
                                  ₹{(collectionsReport.byType?.hostel_fee || 0).toLocaleString('en-IN')}
                                </p>
                              </div>
                            </CardContent>
                          </Card>
                        </div>

                        <Card>
                          <CardContent className="pt-6 pb-6">
                            <div className="flex items-center justify-between">
                              <p className="text-lg font-semibold">Grand Total</p>
                              <p className="text-3xl font-bold text-primary">
                                ₹{(collectionsReport.totalCollections || 0).toLocaleString('en-IN')}
                              </p>
                            </div>
                          </CardContent>
                        </Card>
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        No collections data found
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Manual Payment Tab */}
              <TabsContent value="manual-payment">
                <Card>
                  <CardHeader>
                    <CardTitle>Record Manual Payment</CardTitle>
                    <CardDescription>
                      Record offline or manual payments for student registrations
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-col items-center text-center space-y-4">
                      <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                        <Receipt className="h-8 w-8 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground mb-4">
                          Navigate to the dedicated page to record manual and offline payments
                        </p>
                      </div>
                      <Button onClick={() => navigate('/admin/payments/record')} className="w-full" data-testid="button-navigate-record-payment">
                        Go to Payment Recording
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Payment Verification Tab */}
              <TabsContent value="payment-verification">
                <Card>
                  <CardHeader>
                    <CardTitle>Payment Verification Queue</CardTitle>
                    <CardDescription>
                      Review and verify pending manual payments
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-col items-center text-center space-y-4">
                      <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                        <FileCheck className="h-8 w-8 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground mb-4">
                          Navigate to the dedicated page to verify pending manual payments
                        </p>
                      </div>
                      <Button onClick={() => navigate('/admin/payments/verify')} className="w-full" data-testid="button-navigate-verify-payments">
                        Go to Payment Verification
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Reconciliation Tab */}
              <TabsContent value="reconciliation">
                <Card>
                  <CardHeader>
                    <CardTitle>Payment Reconciliation</CardTitle>
                    <CardDescription>
                      View payment reports and export financial data
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-col items-center text-center space-y-4">
                      <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                        <PieChart className="h-8 w-8 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground mb-4">
                          Navigate to the dedicated page for payment reconciliation and reporting
                        </p>
                      </div>
                      <Button onClick={() => navigate('/admin/payments/reconciliation')} className="w-full" data-testid="button-navigate-reconciliation">
                        Go to Reconciliation
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Payment Reminders Tab */}
              <TabsContent value="reminders">
                <Card>
                  <CardHeader>
                    <CardTitle>Payment Reminders</CardTitle>
                    <CardDescription>
                      Configure and send automated payment reminders
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-col items-center text-center space-y-4">
                      <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                        <Bell className="h-8 w-8 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground mb-4">
                          Navigate to the dedicated page to manage payment reminders
                        </p>
                      </div>
                      <Button onClick={() => navigate('/admin/reminders')} className="w-full" data-testid="button-navigate-reminders">
                        Go to Payment Reminders
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </TabsContent>

          {/* CONTENT & ENGAGEMENT HUB */}
          <TabsContent value="content-engagement">
            <Card>
              <CardHeader>
                <CardTitle>Content Management System</CardTitle>
                <CardDescription>
                  Manage blog posts, faculty profiles, and campus information for the public website
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Blog Management Card */}
                  <Card className="hover-elevate cursor-pointer" onClick={() => navigate('/admin/blog')} data-testid="card-blog-management">
                    <CardContent className="pt-6">
                      <div className="flex flex-col items-center text-center space-y-4">
                        <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                          <BookOpen className="h-8 w-8 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-lg mb-2">Blog Posts</h3>
                          <p className="text-sm text-muted-foreground mb-4">
                            Manage blog articles, success stories, exam tips, and campus life content
                          </p>
                        </div>
                        <Button variant="outline" className="w-full" data-testid="button-manage-blog">
                          Manage Blog
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Faculty Management Card */}
                  <Card className="hover-elevate cursor-pointer" onClick={() => navigate('/admin/faculty')} data-testid="card-faculty-management">
                    <CardContent className="pt-6">
                      <div className="flex flex-col items-center text-center space-y-4">
                        <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                          <UserCircle className="h-8 w-8 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-lg mb-2">Faculty Profiles</h3>
                          <p className="text-sm text-muted-foreground mb-4">
                            Manage faculty member profiles, qualifications, and achievements
                          </p>
                        </div>
                        <Button variant="outline" className="w-full" data-testid="button-manage-faculty">
                          Manage Faculty
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Campus Content Management Card */}
                  <Card className="hover-elevate cursor-pointer" onClick={() => navigate('/admin/campus-content')} data-testid="card-campus-content-management">
                    <CardContent className="pt-6">
                      <div className="flex flex-col items-center text-center space-y-4">
                        <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                          <FileText className="h-8 w-8 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-lg mb-2">Campus Page Sections</h3>
                          <p className="text-sm text-muted-foreground mb-4">
                            Manage campus page marketing content, sections, and features
                          </p>
                        </div>
                        <Button variant="outline" className="w-full" data-testid="button-manage-campus-content">
                          Manage Content
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Programs Management Card */}
                  <Card className="hover-elevate cursor-pointer" onClick={() => navigate('/admin/programs')} data-testid="card-manage-programs">
                    <CardContent className="pt-6">
                      <div className="flex flex-col items-center text-center space-y-4">
                        <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                          <BookOpen className="h-8 w-8 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-lg mb-2">Manage Programs</h3>
                          <p className="text-sm text-muted-foreground mb-4">
                            Update program pages with curriculum and media
                          </p>
                        </div>
                        <Button variant="outline" className="w-full" data-testid="button-manage-programs">
                          Manage Programs
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Testimonials Management Card */}
                  <Card className="hover-elevate cursor-pointer" onClick={() => navigate('/admin/testimonials')} data-testid="card-manage-testimonials">
                    <CardContent className="pt-6">
                      <div className="flex flex-col items-center text-center space-y-4">
                        <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                          <Star className="h-8 w-8 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-lg mb-2">Testimonials</h3>
                          <p className="text-sm text-muted-foreground mb-4">
                            Manage student testimonials and success stories
                          </p>
                        </div>
                        <Button variant="outline" className="w-full" data-testid="button-manage-testimonials">
                          Manage Testimonials
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Facilities Management Card */}
                  <Card className="hover-elevate cursor-pointer" onClick={() => navigate('/admin/facilities')} data-testid="card-manage-facilities">
                    <CardContent className="pt-6">
                      <div className="flex flex-col items-center text-center space-y-4">
                        <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                          <Building className="h-8 w-8 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-lg mb-2">Facilities</h3>
                          <p className="text-sm text-muted-foreground mb-4">
                            Manage campus facilities and amenities
                          </p>
                        </div>
                        <Button variant="outline" className="w-full" data-testid="button-manage-facilities">
                          Manage Facilities
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Yearly Stats Management Card */}
                  <Card className="hover-elevate cursor-pointer" onClick={() => navigate('/admin/yearly-stats')} data-testid="card-manage-yearly-stats">
                    <CardContent className="pt-6">
                      <div className="flex flex-col items-center text-center space-y-4">
                        <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                          <TrendingUp className="h-8 w-8 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-lg mb-2">Yearly Statistics</h3>
                          <p className="text-sm text-muted-foreground mb-4">
                            Manage annual performance metrics and results
                          </p>
                        </div>
                        <Button variant="outline" className="w-full" data-testid="button-manage-yearly-stats">
                          Manage Statistics
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Legal Pages Management Card */}
                  <Card className="hover-elevate cursor-pointer" onClick={() => navigate('/admin/legal-pages')} data-testid="card-legal-management">
                    <CardContent className="pt-6">
                      <div className="flex flex-col items-center text-center space-y-4">
                        <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                          <Scale className="h-8 w-8 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-lg mb-2">Legal Pages</h3>
                          <p className="text-sm text-muted-foreground mb-4">
                            Manage Terms & Conditions, Privacy Policy, Refund Policy, and other compliance pages
                          </p>
                        </div>
                        <Button variant="outline" className="w-full" data-testid="button-manage-legal">
                          Manage Legal Pages
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </CardContent>
            </Card>

            {/* Announcements Section */}
            <div className="mt-6">
              <AnnouncementsTab campuses={campuses} programs={programs} />
            </div>
          </TabsContent>

          {/* SETTINGS HUB */}
          <TabsContent value="settings">
            <Tabs defaultValue="general">
              <TabsList className="mb-6">
                <TabsTrigger value="general" data-testid="tab-settings-general">
                  General
                </TabsTrigger>
                <TabsTrigger value="users" data-testid="tab-settings-users">
                  <Users className="w-4 h-4 mr-2" />
                  Users & Roles
                </TabsTrigger>
              </TabsList>
              <TabsContent value="general">
                <SystemSettingsPanel />
              </TabsContent>
              <TabsContent value="users">
                <AdminUsersPanel />
              </TabsContent>
            </Tabs>
          </TabsContent>
        </Tabs>

        {/* Manual Payment Dialog */}
        <Dialog open={manualPaymentDialog} onOpenChange={setManualPaymentDialog}>
          <DialogContent data-testid="dialog-manual-payment">
            <DialogHeader>
              <DialogTitle>Record Manual Payment</DialogTitle>
              <DialogDescription>
                Record an offline or manual payment for a student registration
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Registration ID *</label>
                <Input
                  placeholder="Enter registration ID"
                  value={manualPaymentForm.registrationId}
                  onChange={(e) => setManualPaymentForm({ ...manualPaymentForm, registrationId: e.target.value })}
                  data-testid="input-manual-payment-registration-id"
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Payment Type *</label>
                <Select
                  value={manualPaymentForm.paymentType || undefined}
                  onValueChange={(value) => setManualPaymentForm({ ...manualPaymentForm, paymentType: value })}
                >
                  <SelectTrigger data-testid="select-manual-payment-type">
                    <SelectValue placeholder="Select payment type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="registration_fee">Registration Fee</SelectItem>
                    <SelectItem value="remaining_fee">Remaining Fee</SelectItem>
                    <SelectItem value="hostel_fee">Hostel Fee</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Amount (₹) *</label>
                <Input
                  type="number"
                  placeholder="Enter amount in INR"
                  value={manualPaymentForm.amount}
                  onChange={(e) => setManualPaymentForm({ ...manualPaymentForm, amount: e.target.value })}
                  data-testid="input-manual-payment-amount"
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Description</label>
                <Textarea
                  placeholder="Enter payment description (optional)"
                  value={manualPaymentForm.description}
                  onChange={(e) => setManualPaymentForm({ ...manualPaymentForm, description: e.target.value })}
                  rows={3}
                  data-testid="textarea-manual-payment-description"
                />
              </div>

              <div className="flex gap-2 pt-4">
                <Button
                  onClick={handleManualPaymentSubmit}
                  disabled={recordManualPaymentMutation.isPending}
                  className="flex-1"
                  data-testid="button-submit-manual-payment"
                >
                  {recordManualPaymentMutation.isPending ? "Recording..." : "Record Payment"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setManualPaymentDialog(false)}
                  disabled={recordManualPaymentMutation.isPending}
                  data-testid="button-cancel-manual-payment"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Ticket Response Dialog */}
        <Dialog open={!!selectedTicket} onOpenChange={() => setSelectedTicket(null)}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto" data-testid="dialog-ticket-response">
            {selectedTicket && (
              <>
                <DialogHeader>
                  <DialogTitle>Respond to Ticket</DialogTitle>
                  <DialogDescription>
                    Ticket ID: {selectedTicket.id}
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 mt-4">
                  {/* Ticket Details */}
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Student</p>
                      <p className="font-medium">{selectedTicket.student?.name || "N/A"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Email</p>
                      <p className="font-medium">{selectedTicket.student?.email || "N/A"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Category</p>
                      <p className="font-medium capitalize">{selectedTicket.category}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Priority</p>
                      <p className="font-medium capitalize">{selectedTicket.priority}</p>
                    </div>
                  </div>

                  {/* Subject & Description */}
                  <div>
                    <h4 className="font-semibold mb-1">Subject</h4>
                    <p className="text-sm">{selectedTicket.subject}</p>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-1">Description</h4>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {selectedTicket.description}
                    </p>
                  </div>

                  {/* Status Select */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium mb-2 block">Status</label>
                      <Select value={ticketStatus} onValueChange={setTicketStatus}>
                        <SelectTrigger data-testid="select-ticket-status">
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="open">Open</SelectItem>
                          <SelectItem value="in-progress">In Progress</SelectItem>
                          <SelectItem value="resolved">Resolved</SelectItem>
                          <SelectItem value="closed">Closed</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-2 block">Assign To</label>
                      <Input
                        placeholder="Admin name (optional)"
                        value={assignedTo}
                        onChange={(e) => setAssignedTo(e.target.value)}
                        data-testid="input-assigned-to"
                      />
                    </div>
                  </div>

                  {/* Admin Response */}
                  <div>
                    <label className="text-sm font-medium mb-2 block">Admin Response</label>
                    <Textarea
                      placeholder="Type your response to the student..."
                      value={adminResponse}
                      onChange={(e) => setAdminResponse(e.target.value)}
                      className="min-h-32"
                      data-testid="textarea-admin-response"
                    />
                  </div>

                  {/* Actions */}
                  <div className="flex gap-3 justify-end">
                    <Button
                      variant="outline"
                      onClick={() => setSelectedTicket(null)}
                      data-testid="button-cancel-response"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleUpdateTicket}
                      disabled={updateTicketMutation.isPending || !adminResponse.trim() || !ticketStatus}
                      data-testid="button-save-response"
                    >
                      {updateTicketMutation.isPending ? "Updating..." : "Update Ticket"}
                    </Button>
                  </div>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>


        {/* Hostel Bed Type Dialog */}
        <HostelBedTypeDialog
          open={hostelBedTypeDialog.open}
          bedType={hostelBedTypeDialog.bedType}
          campuses={campuses || []}
          onClose={() => setHostelBedTypeDialog({ open: false, bedType: null })}
          onSave={(data) => {
            if (hostelBedTypeDialog.bedType) {
              updateHostelBedTypeMutation.mutate({ id: hostelBedTypeDialog.bedType.id, data });
            } else {
              createHostelBedTypeMutation.mutate(data);
            }
          }}
        />

        {/* Fee Configuration Dialog */}
        <FeeConfigDialog
          open={feeConfigDialog.open}
          config={feeConfigDialog.config}
          campuses={campuses || []}
          programs={programs || []}
          onClose={() => setFeeConfigDialog({ open: false, config: null })}
          onSave={(data) => {
            if (feeConfigDialog.config) {
              updateFeeConfigMutation.mutate({ id: feeConfigDialog.config.id, data });
            } else {
              createFeeConfigMutation.mutate(data);
            }
          }}
        />

        {/* Promo Code Dialog */}
        <PromoCodeDialog
          open={promoCodeDialog.open}
          promoCode={promoCodeDialog.promoCode}
          campuses={campuses || []}
          programs={programs || []}
          onClose={() => setPromoCodeDialog({ open: false, promoCode: null })}
          onSave={(data) => {
            if (promoCodeDialog.promoCode) {
              updatePromoCode.mutate({ id: promoCodeDialog.promoCode.id, data });
            } else {
              createPromoCode.mutate(data);
            }
          }}
        />
      </div>
    </div>
  );
}

// Hostel Bed Type Dialog Component
function HostelBedTypeDialog({
  open,
  bedType,
  campuses,
  onClose,
  onSave,
}: {
  open: boolean;
  bedType: HostelBedType | null;
  campuses: Campus[];
  onClose: () => void;
  onSave: (data: InsertHostelBedType) => void;
}) {
  const [formData, setFormData] = useState<InsertHostelBedType>({
    campusId: "",
    bedType: "single",
    monthlyFee: 0,
    totalBeds: 0,
    availableBeds: 0,
    isActive: true,
  });

  useEffect(() => {
    if (open) {
      setFormData({
        campusId: bedType?.campusId || "",
        bedType: (bedType?.bedType as "single" | "twin" | "triple") || "single",
        monthlyFee: bedType?.monthlyFee || 0,
        totalBeds: bedType?.totalBeds || 0,
        availableBeds: bedType?.availableBeds || 0,
        isActive: bedType?.isActive ?? true,
      });
    }
  }, [open, bedType]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="dialog-hostel-bed-type">
        <DialogHeader>
          <DialogTitle>{bedType ? "Edit Hostel Bed Type" : "Add New Hostel Bed Type"}</DialogTitle>
          <DialogDescription>
            {bedType ? "Update hostel bed type information" : "Create a new hostel bed type"}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-2 block">Campus</label>
            <Select value={formData.campusId} onValueChange={(value) => setFormData({ ...formData, campusId: value })}>
              <SelectTrigger data-testid="select-hostel-bed-type-campus">
                <SelectValue placeholder="Select campus" />
              </SelectTrigger>
              <SelectContent>
                {campuses.map((campus) => (
                  <SelectItem key={campus.id} value={campus.id}>
                    {campus.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium mb-2 block">Bed Type</label>
            <Select value={formData.bedType} onValueChange={(value: "single" | "twin" | "triple") => setFormData({ ...formData, bedType: value })}>
              <SelectTrigger data-testid="select-hostel-bed-type-type">
                <SelectValue placeholder="Select bed type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="single">Single</SelectItem>
                <SelectItem value="twin">Twin</SelectItem>
                <SelectItem value="triple">Triple</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium mb-2 block">Monthly Fee (₹)</label>
            <Input
              type="number"
              value={formData.monthlyFee}
              onChange={(e) => setFormData({ ...formData, monthlyFee: parseInt(e.target.value) || 0 })}
              required
              min="0"
              data-testid="input-hostel-bed-type-monthly-fee"
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-2 block">Total Beds</label>
            <Input
              type="number"
              value={formData.totalBeds}
              onChange={(e) => setFormData({ ...formData, totalBeds: parseInt(e.target.value) || 0 })}
              required
              min="1"
              data-testid="input-hostel-bed-type-total-beds"
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-2 block">Available Beds</label>
            <Input
              type="number"
              value={formData.availableBeds}
              onChange={(e) => setFormData({ ...formData, availableBeds: parseInt(e.target.value) || 0 })}
              required
              min="0"
              data-testid="input-hostel-bed-type-available-beds"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={formData.isActive}
              onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
              data-testid="checkbox-hostel-bed-type-active"
            />
            <label className="text-sm font-medium">Active</label>
          </div>
          <div className="flex gap-3 justify-end">
            <Button type="button" variant="outline" onClick={onClose} data-testid="button-cancel-hostel-bed-type">
              Cancel
            </Button>
            <Button type="submit" data-testid="button-save-hostel-bed-type">
              {bedType ? "Update" : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Fee Configuration Dialog Component
function FeeConfigDialog({
  open,
  config,
  campuses,
  programs,
  onClose,
  onSave,
}: {
  open: boolean;
  config: FeeConfiguration | null;
  campuses: Campus[];
  programs: Program[];
  onClose: () => void;
  onSave: (data: InsertFeeConfiguration) => void;
}) {
  const [formData, setFormData] = useState<InsertFeeConfiguration>({
    campusId: "",
    programId: "",
    registrationFee: 0,
    programFee: 0,
    totalFee: 0,
    isActive: true,
  });

  useEffect(() => {
    if (open) {
      setFormData({
        campusId: config?.campusId || "",
        programId: config?.programId || "",
        registrationFee: config?.registrationFee || 0,
        programFee: config?.programFee || 0,
        totalFee: config?.totalFee || 0,
        isActive: config?.isActive ?? true,
      });
    }
  }, [open, config]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="dialog-fee-configuration">
        <DialogHeader>
          <DialogTitle>{config ? "Edit Fee Configuration" : "Add New Fee Configuration"}</DialogTitle>
          <DialogDescription>
            {config ? "Update fee configuration" : "Create a new fee configuration"}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-2 block">Campus</label>
            <Select value={formData.campusId} onValueChange={(value) => setFormData({ ...formData, campusId: value })}>
              <SelectTrigger data-testid="select-fee-configuration-campus">
                <SelectValue placeholder="Select campus" />
              </SelectTrigger>
              <SelectContent>
                {campuses.map((campus) => (
                  <SelectItem key={campus.id} value={campus.id}>
                    {campus.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium mb-2 block">Program</label>
            <Select value={formData.programId} onValueChange={(value) => setFormData({ ...formData, programId: value })}>
              <SelectTrigger data-testid="select-fee-configuration-program">
                <SelectValue placeholder="Select program" />
              </SelectTrigger>
              <SelectContent>
                {programs.map((program) => (
                  <SelectItem key={program.id} value={program.id}>
                    {program.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium mb-2 block">Registration Fee (₹)</label>
            <Input
              type="number"
              value={formData.registrationFee}
              onChange={(e) => setFormData({ ...formData, registrationFee: parseInt(e.target.value) || 0 })}
              required
              min="0"
              data-testid="input-fee-configuration-registration-fee"
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-2 block">Program Fee (₹)</label>
            <Input
              type="number"
              value={formData.programFee}
              onChange={(e) => setFormData({ ...formData, programFee: parseInt(e.target.value) || 0 })}
              required
              min="0"
              data-testid="input-fee-configuration-program-fee"
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-2 block">Total Fee (₹)</label>
            <Input
              type="number"
              value={formData.totalFee}
              onChange={(e) => setFormData({ ...formData, totalFee: parseInt(e.target.value) || 0 })}
              required
              min="0"
              data-testid="input-fee-configuration-total-fee"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={formData.isActive}
              onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
              data-testid="checkbox-fee-configuration-active"
            />
            <label className="text-sm font-medium">Active</label>
          </div>
          <div className="flex gap-3 justify-end">
            <Button type="button" variant="outline" onClick={onClose} data-testid="button-cancel-fee-configuration">
              Cancel
            </Button>
            <Button type="submit" data-testid="button-save-fee-configuration">
              {config ? "Update" : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Promo Code Dialog Component
function PromoCodeDialog({
  open,
  promoCode,
  campuses,
  programs,
  onClose,
  onSave,
}: {
  open: boolean;
  promoCode: SelectPromoCode | null;
  campuses: Campus[];
  programs: Program[];
  onClose: () => void;
  onSave: (data: InsertPromoCode) => void;
}) {
  const [formData, setFormData] = useState<InsertPromoCode>({
    code: "",
    discountType: "percentage",
    discountValue: 0,
    validFrom: new Date(),
    validTo: new Date(),
    maxUses: undefined,
    programIds: undefined,
    campusIds: undefined,
    isActive: true,
  });

  useEffect(() => {
    if (open) {
      if (promoCode) {
        setFormData({
          code: promoCode.code,
          discountType: promoCode.discountType as "percentage" | "fixed",
          discountValue: promoCode.discountValue,
          validFrom: new Date(promoCode.validFrom),
          validTo: new Date(promoCode.validTo),
          maxUses: promoCode.maxUses ?? undefined,
          programIds: promoCode.programIds ?? undefined,
          campusIds: promoCode.campusIds ?? undefined,
          isActive: promoCode.isActive,
        });
      } else {
        setFormData({
          code: "",
          discountType: "percentage",
          discountValue: 0,
          validFrom: new Date(),
          validTo: new Date(),
          maxUses: undefined,
          programIds: undefined,
          campusIds: undefined,
          isActive: true,
        });
      }
    }
  }, [open, promoCode]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  const formatDateForInput = (date: Date) => {
    return date.toISOString().split('T')[0];
  };

  const toggleProgram = (programId: string) => {
    const currentIds = formData.programIds || [];
    if (currentIds.includes(programId)) {
      setFormData({ 
        ...formData, 
        programIds: currentIds.filter(id => id !== programId).length > 0 
          ? currentIds.filter(id => id !== programId) 
          : undefined 
      });
    } else {
      setFormData({ ...formData, programIds: [...currentIds, programId] });
    }
  };

  const toggleCampus = (campusId: string) => {
    const currentIds = formData.campusIds || [];
    if (currentIds.includes(campusId)) {
      setFormData({ 
        ...formData, 
        campusIds: currentIds.filter(id => id !== campusId).length > 0 
          ? currentIds.filter(id => id !== campusId) 
          : undefined 
      });
    } else {
      setFormData({ ...formData, campusIds: [...currentIds, campusId] });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="dialog-promo-code">
        <DialogHeader>
          <DialogTitle>{promoCode ? "Edit Promo Code" : "Add New Promo Code"}</DialogTitle>
          <DialogDescription>
            {promoCode ? "Update promo code information" : "Create a new promotional discount code"}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-2 block">Code</label>
            <Input
              type="text"
              value={formData.code}
              onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
              placeholder="e.g., EARLY2025, REFER50"
              required
              data-testid="input-promo-code-code"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Discount Type</label>
              <Select 
                value={formData.discountType} 
                onValueChange={(value: "percentage" | "fixed") => setFormData({ ...formData, discountType: value })}
              >
                <SelectTrigger data-testid="select-promo-code-discount-type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">Percentage (%)</SelectItem>
                  <SelectItem value="fixed">Fixed Amount (₹)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">
                Discount Value {formData.discountType === "percentage" ? "(%)" : "(₹)"}
              </label>
              <Input
                type="number"
                value={formData.discountValue}
                onChange={(e) => setFormData({ ...formData, discountValue: parseInt(e.target.value) || 0 })}
                required
                min="0"
                max={formData.discountType === "percentage" ? "100" : undefined}
                data-testid="input-promo-code-discount-value"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Valid From</label>
              <Input
                type="date"
                value={formatDateForInput(formData.validFrom)}
                onChange={(e) => setFormData({ ...formData, validFrom: new Date(e.target.value) })}
                required
                data-testid="input-promo-code-valid-from"
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Valid To</label>
              <Input
                type="date"
                value={formatDateForInput(formData.validTo)}
                onChange={(e) => setFormData({ ...formData, validTo: new Date(e.target.value) })}
                required
                data-testid="input-promo-code-valid-to"
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">Max Uses (Optional)</label>
            <Input
              type="number"
              value={formData.maxUses ?? ""}
              onChange={(e) => setFormData({ 
                ...formData, 
                maxUses: e.target.value ? parseInt(e.target.value) : undefined 
              })}
              placeholder="Leave empty for unlimited"
              min="1"
              data-testid="input-promo-code-max-uses"
            />
            <p className="text-xs text-muted-foreground mt-1">Leave empty for unlimited uses</p>
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">Program Restrictions (Optional)</label>
            <div className="border rounded-md p-3 space-y-2 max-h-32 overflow-y-auto">
              {programs.length > 0 ? (
                programs.map((program) => (
                  <div key={program.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={(formData.programIds || []).includes(program.id)}
                      onChange={() => toggleProgram(program.id)}
                      data-testid={`checkbox-promo-code-program-${program.id}`}
                    />
                    <label className="text-sm">{program.name}</label>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No programs available</p>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Leave empty to apply to all programs</p>
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">Campus Restrictions (Optional)</label>
            <div className="border rounded-md p-3 space-y-2 max-h-32 overflow-y-auto">
              {campuses.length > 0 ? (
                campuses.map((campus) => (
                  <div key={campus.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={(formData.campusIds || []).includes(campus.id)}
                      onChange={() => toggleCampus(campus.id)}
                      data-testid={`checkbox-promo-code-campus-${campus.id}`}
                    />
                    <label className="text-sm">{campus.name}</label>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No campuses available</p>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Leave empty to apply to all campuses</p>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={formData.isActive}
              onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
              data-testid="checkbox-promo-code-active"
            />
            <label className="text-sm font-medium">Active</label>
          </div>

          <div className="flex gap-3 justify-end">
            <Button type="button" variant="outline" onClick={onClose} data-testid="button-cancel-promo-code">
              Cancel
            </Button>
            <Button type="submit" data-testid="button-save-promo-code">
              {promoCode ? "Update" : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Announcements Tab Component
const announcementFormSchema = z.object({
  title: z.string().min(1, "Title is required").max(100, "Title must be 100 characters or less"),
  message: z.string().min(1, "Message is required").max(500, "Message must be 500 characters or less"),
  type: z.enum(["announcement", "reminder", "payment"]),
  recipientType: z.enum(["all", "campus", "program"]),
  campusId: z.string().optional(),
  programId: z.string().optional(),
}).refine(
  (data) => {
    if (data.recipientType === "campus" && !data.campusId) {
      return false;
    }
    if (data.recipientType === "program" && !data.programId) {
      return false;
    }
    return true;
  },
  {
    message: "Please select a campus or program based on recipient type",
    path: ["campusId"],
  }
);

type AnnouncementFormValues = z.infer<typeof announcementFormSchema>;

function AnnouncementsTab({ 
  campuses, 
  programs 
}: { 
  campuses: Campus[] | undefined; 
  programs: Program[] | undefined;
}) {
  const { toast } = useToast();

  const form = useForm<AnnouncementFormValues>({
    resolver: zodResolver(announcementFormSchema),
    defaultValues: {
      title: "",
      message: "",
      type: "announcement",
      recipientType: "all",
      campusId: "",
      programId: "",
    },
  });

  const recipientType = form.watch("recipientType");

  const paymentRemindersMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/admin/notifications/payment-reminders", {});
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to send payment reminders");
      }
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Payment reminders sent",
        description: `Payment reminders sent to ${data.studentsNotified} students (Total pending: ₹${data.totalPendingAmount})`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to send payment reminders",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const broadcastMutation = useMutation({
    mutationFn: async (data: AnnouncementFormValues) => {
      const payload: any = {
        title: data.title,
        message: data.message,
        type: data.type,
        recipientType: data.recipientType,
      };

      if (data.recipientType === "campus" && data.campusId) {
        payload.campusId = data.campusId;
      }

      if (data.recipientType === "program" && data.programId) {
        payload.programId = data.programId;
      }

      const response = await apiRequest("POST", "/api/admin/notifications/broadcast", payload);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to broadcast announcement");
      }
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Announcement sent",
        description: `Announcement sent to ${data.studentsNotified || 0} students`,
      });
      form.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to send announcement",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: AnnouncementFormValues) => {
    broadcastMutation.mutate(data);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Broadcast Announcement</CardTitle>
          <CardDescription>
            Send notifications to students based on recipient type
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title *</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Enter announcement title"
                        data-testid="input-announcement-title"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="message"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Message *</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Enter announcement message"
                        rows={5}
                        data-testid="textarea-announcement-message"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-announcement-type">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="announcement">Announcement</SelectItem>
                        <SelectItem value="reminder">Reminder</SelectItem>
                        <SelectItem value="payment">Payment</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="recipientType"
                render={({ field }) => (
                  <FormItem className="space-y-3">
                    <FormLabel>Recipient Type</FormLabel>
                    <FormControl>
                      <RadioGroup
                        onValueChange={field.onChange}
                        value={field.value}
                        className="flex flex-col space-y-1"
                        data-testid="radio-recipient-type"
                      >
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="all" id="all" />
                          <Label htmlFor="all">All Students</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="campus" id="campus" />
                          <Label htmlFor="campus">By Campus</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="program" id="program" />
                          <Label htmlFor="program">By Program</Label>
                        </div>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {recipientType === "campus" && (
                <FormField
                  control={form.control}
                  name="campusId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Campus *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-campus">
                            <SelectValue placeholder="Select campus" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {campuses?.map((campus) => (
                            <SelectItem key={campus.id} value={campus.id}>
                              {campus.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {recipientType === "program" && (
                <FormField
                  control={form.control}
                  name="programId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Program *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-program">
                            <SelectValue placeholder="Select program" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {programs?.map((program) => (
                            <SelectItem key={program.id} value={program.id}>
                              {program.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <Button
                type="submit"
                disabled={broadcastMutation.isPending || !form.formState.isValid}
                data-testid="button-send-announcement"
                className="w-full"
              >
                {broadcastMutation.isPending ? (
                  <>
                    <Clock className="w-4 h-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Send Announcement
                  </>
                )}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card data-testid="card-payment-reminders">
        <CardHeader>
          <CardTitle>Automated Payment Reminders</CardTitle>
          <CardDescription>
            Send automatic reminders to all students with pending payments
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={() => paymentRemindersMutation.mutate()}
            disabled={paymentRemindersMutation.isPending}
            data-testid="button-send-payment-reminders"
            className="w-full"
          >
            {paymentRemindersMutation.isPending ? (
              <>
                <Clock className="w-4 h-4 mr-2 animate-spin" />
                Sending reminders...
              </>
            ) : (
              <>
                <IndianRupee className="w-4 h-4 mr-2" />
                Send Payment Reminders
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Broadcasts</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            Broadcast history coming soon
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function BulkImportTab({
  csvFile,
  previewData,
  importResult,
  previewLoading,
  importLoading,
  onDownloadTemplate,
  onFileChange,
  onPreviewImport,
  onExecuteImport,
  onReset,
  onDownloadErrors,
}: {
  csvFile: File | null;
  previewData: {
    valid: Array<{
      name: string;
      email: string;
      phone: string;
      campus: string;
      program: string;
    }>;
    invalid: Array<{
      row: number;
      errors: string[];
    }>;
    summary: {
      total: number;
      valid: number;
      invalid: number;
    };
  } | null;
  importResult: {
    success: boolean;
    batchId: string;
    imported: number;
    students?: Array<{
      name: string;
      email: string;
      campus: string;
      program: string;
    }>;
    failed?: Array<{
      row: number;
      data?: {
        name?: string;
        email?: string;
      };
      errors: string[];
    }>;
  } | null;
  previewLoading: boolean;
  importLoading: boolean;
  onDownloadTemplate: () => void;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onPreviewImport: () => void;
  onExecuteImport: () => void;
  onReset: () => void;
  onDownloadErrors: (failedRecords: Array<{
    row: number;
    data?: { name?: string; email?: string; };
    errors: string[];
  }>) => void;
}) {
  if (importResult) {
    return (
      <div className="space-y-6">
        <Card data-testid="card-import-summary">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-6 w-6 text-primary" />
              Import Successful
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-muted rounded-md">
                <span className="text-muted-foreground">Students Imported</span>
                <span className="text-2xl font-bold" data-testid="text-students-imported">
                  {importResult.imported}
                </span>
              </div>
              <div className="flex items-center justify-between p-4 bg-muted rounded-md">
                <span className="text-muted-foreground">Batch ID</span>
                <span className="font-mono text-sm" data-testid="text-batch-id">
                  {importResult.batchId}
                </span>
              </div>
            </div>

            <div className="flex items-start gap-2 p-4 bg-muted rounded-md">
              <AlertCircle className="h-5 w-5 text-muted-foreground mt-0.5" />
              <p className="text-sm text-muted-foreground">
                Welcome emails have been sent to all imported students with their login credentials
              </p>
            </div>
          </CardContent>
        </Card>

        {importResult.students && importResult.students.length > 0 && (
          <Card data-testid="card-imported-students">
            <CardHeader>
              <CardTitle>Imported Students</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Campus</TableHead>
                    <TableHead>Program</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {importResult.students.slice(0, 20).map((student, index) => (
                    <TableRow key={index} data-testid={`row-imported-student-${index}`}>
                      <TableCell className="font-medium">{student.name}</TableCell>
                      <TableCell>{student.email}</TableCell>
                      <TableCell>{student.campus}</TableCell>
                      <TableCell>{student.program}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {importResult.students.length > 20 && (
                <p className="text-sm text-muted-foreground text-center mt-4" data-testid="text-more-students">
                  ...{importResult.students.length - 20} more
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {importResult.failed && importResult.failed.length > 0 && (
          <Card data-testid="card-failed-imports">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Failed Imports</CardTitle>
                <Button
                  variant="outline"
                  onClick={() => onDownloadErrors(importResult.failed!)}
                  data-testid="button-download-errors"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download Error Report
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Row #</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Errors</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {importResult.failed.map((record, index) => (
                    <TableRow key={index} data-testid={`row-failed-${index}`}>
                      <TableCell className="font-medium">{record.row}</TableCell>
                      <TableCell>{record.data?.name || '-'}</TableCell>
                      <TableCell>{record.data?.email || '-'}</TableCell>
                      <TableCell>
                        <ul className="list-disc list-inside space-y-1">
                          {record.errors.map((error, errorIndex) => (
                            <li key={errorIndex} className="text-sm text-destructive">
                              {error}
                            </li>
                          ))}
                        </ul>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        <Button
          onClick={onReset}
          className="w-full"
          data-testid="button-import-another"
        >
          Import Another Batch
        </Button>
      </div>
    );
  }

  if (previewData) {
    return (
      <div className="space-y-6">
        <Card data-testid="card-preview-summary">
          <CardHeader>
            <CardTitle>Import Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="p-4 bg-muted rounded-md">
                <p className="text-sm text-muted-foreground mb-1">Total Rows</p>
                <p className="text-2xl font-bold" data-testid="text-total-rows">
                  {previewData.summary.total}
                </p>
              </div>
              <div className="p-4 bg-muted rounded-md">
                <p className="text-sm text-muted-foreground mb-1">Valid Rows</p>
                <div className="flex items-center gap-2">
                  <p className="text-2xl font-bold" data-testid="text-valid-rows">
                    {previewData.summary.valid}
                  </p>
                  <Badge variant="default" className="bg-primary">
                    Valid
                  </Badge>
                </div>
              </div>
              <div className="p-4 bg-muted rounded-md">
                <p className="text-sm text-muted-foreground mb-1">Invalid Rows</p>
                <div className="flex items-center gap-2">
                  <p className="text-2xl font-bold" data-testid="text-invalid-rows">
                    {previewData.summary.invalid}
                  </p>
                  <Badge variant="destructive">Invalid</Badge>
                </div>
              </div>
            </div>

            <Tabs defaultValue="valid" className="mb-6">
              <TabsList className="w-full">
                <TabsTrigger value="valid" className="flex-1" data-testid="tab-valid-records">
                  Valid Records ({previewData.summary.valid})
                </TabsTrigger>
                <TabsTrigger value="invalid" className="flex-1" data-testid="tab-invalid-records">
                  Invalid Records ({previewData.summary.invalid})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="valid">
                {previewData.valid.length > 0 ? (
                  <div className="space-y-4">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Phone</TableHead>
                          <TableHead>Campus</TableHead>
                          <TableHead>Program</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {previewData.valid.slice(0, 10).map((record, index) => (
                          <TableRow key={index} data-testid={`row-valid-${index}`}>
                            <TableCell className="font-medium">{record.name}</TableCell>
                            <TableCell>{record.email}</TableCell>
                            <TableCell>{record.phone}</TableCell>
                            <TableCell>{record.campus}</TableCell>
                            <TableCell>{record.program}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {previewData.valid.length > 10 && (
                      <p className="text-sm text-muted-foreground text-center" data-testid="text-more-valid">
                        ...{previewData.valid.length - 10} more
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No valid records found
                  </div>
                )}
              </TabsContent>

              <TabsContent value="invalid">
                {previewData.invalid.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Row #</TableHead>
                        <TableHead>Errors</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewData.invalid.map((record, index) => (
                        <TableRow key={index} data-testid={`row-invalid-${index}`}>
                          <TableCell className="font-medium">{record.row}</TableCell>
                          <TableCell>
                            <ul className="list-disc list-inside space-y-1">
                              {record.errors.map((error, errorIndex) => (
                                <li key={errorIndex} className="text-sm text-destructive">
                                  {error}
                                </li>
                              ))}
                            </ul>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No invalid records
                  </div>
                )}
              </TabsContent>
            </Tabs>

            <div className="flex gap-4">
              <Button
                variant="outline"
                onClick={onReset}
                className="flex-1"
                data-testid="button-go-back"
              >
                Go Back
              </Button>
              <Button
                onClick={onExecuteImport}
                disabled={previewData.summary.invalid > 0 || importLoading}
                className="flex-1"
                data-testid="button-execute-import"
              >
                {importLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  "Import Students"
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <Card data-testid="card-upload-stage">
      <CardHeader>
        <CardTitle>Import Students from CSV</CardTitle>
        <CardDescription>
          Upload a CSV file to bulk import existing students. Download the template to get started.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="bg-muted/50 rounded-lg p-4 space-y-2">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            Template Instructions
          </h4>
          <ul className="text-sm text-muted-foreground space-y-1 ml-6 list-disc">
            <li>Row 2 shows acceptable values for each field (format guidance)</li>
            <li>Rows 3-5 contain sample data - you can replace or delete these</li>
            <li>Campus and Program names must match exactly (case-insensitive)</li>
            <li>Bed Type: single, twin, or triple</li>
            <li>Registration Fee Paid: Yes or No</li>
            <li>Remaining Fee Status: Full, Partial, or Pending</li>
            <li>Phone numbers must be exactly 10 digits</li>
            <li>Emails must be unique (no duplicates)</li>
          </ul>
        </div>
        
        <div className="flex flex-col gap-4">
          <Button
            variant="outline"
            onClick={onDownloadTemplate}
            className="w-full"
            data-testid="button-download-template"
          >
            <Download className="w-4 h-4 mr-2" />
            Download Template with Sample Data
          </Button>

          <div className="space-y-2">
            <label className="text-sm font-medium">Upload CSV File</label>
            <Input
              type="file"
              accept=".csv"
              onChange={onFileChange}
              data-testid="input-csv-file"
            />
            {csvFile && (
              <p className="text-sm text-muted-foreground">
                Selected: {csvFile.name}
              </p>
            )}
          </div>

          <Button
            onClick={onPreviewImport}
            disabled={!csvFile || previewLoading}
            className="w-full"
            data-testid="button-preview-import"
          >
            {previewLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                Preview Import
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
