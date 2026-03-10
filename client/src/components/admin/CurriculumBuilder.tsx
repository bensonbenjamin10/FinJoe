import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Plus, Trash2, Calendar } from "lucide-react";
import type { CurriculumSchedule, CurriculumMonth, CurriculumMonthDetail } from "@shared/schema";

const DEFAULT_DETAIL: CurriculumMonthDetail = {
  title: "",
  duration: "",
  test: "",
};

const DEFAULT_MONTH: CurriculumMonth = {
  monthNumber: 1,
  subjects: [],
  details: [],
  holiday: "",
};

interface CurriculumBuilderProps {
  value: CurriculumSchedule | null;
  onChange: (schedule: CurriculumSchedule | null) => void;
}

export function CurriculumBuilder({ value, onChange }: CurriculumBuilderProps) {
  const schedule = value || {
    title: "",
    description: "",
    months: [],
    summary: { totalSubjects: 0, duration: "", description: "" },
  };

  const updateField = (field: keyof CurriculumSchedule, fieldValue: any) => {
    onChange({ ...schedule, [field]: fieldValue });
  };

  const addMonth = () => {
    const nextMonth = schedule.months.length + 1;
    onChange({
      ...schedule,
      months: [...schedule.months, { ...DEFAULT_MONTH, monthNumber: nextMonth }],
    });
  };

  const removeMonth = (index: number) => {
    const updated = schedule.months.filter((_, i) => i !== index).map((m, i) => ({
      ...m,
      monthNumber: i + 1,
    }));
    onChange({ ...schedule, months: updated });
  };

  const updateMonth = (index: number, field: keyof CurriculumMonth, fieldValue: any) => {
    const updated = [...schedule.months];
    updated[index] = { ...updated[index], [field]: fieldValue };
    onChange({ ...schedule, months: updated });
  };

  const addDetail = (monthIndex: number) => {
    const updated = [...schedule.months];
    updated[monthIndex] = {
      ...updated[monthIndex],
      details: [...updated[monthIndex].details, { ...DEFAULT_DETAIL }],
    };
    onChange({ ...schedule, months: updated });
  };

  const removeDetail = (monthIndex: number, detailIndex: number) => {
    const updated = [...schedule.months];
    updated[monthIndex] = {
      ...updated[monthIndex],
      details: updated[monthIndex].details.filter((_, i) => i !== detailIndex),
    };
    onChange({ ...schedule, months: updated });
  };

  const updateDetail = (monthIndex: number, detailIndex: number, field: keyof CurriculumMonthDetail, fieldValue: string) => {
    const updated = [...schedule.months];
    updated[monthIndex] = {
      ...updated[monthIndex],
      details: updated[monthIndex].details.map((d, i) =>
        i === detailIndex ? { ...d, [field]: fieldValue } : d
      ),
    };
    onChange({ ...schedule, months: updated });
  };

  const updateCumulative = (monthIndex: number, field: "title" | "description", fieldValue: string) => {
    const updated = [...schedule.months];
    updated[monthIndex] = {
      ...updated[monthIndex],
      cumulative: {
        ...updated[monthIndex].cumulative,
        title: updated[monthIndex].cumulative?.title || "",
        description: updated[monthIndex].cumulative?.description || "",
        [field]: fieldValue,
      },
    };
    onChange({ ...schedule, months: updated });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="text-base font-semibold">Curriculum Schedule</Label>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <div>
          <Label htmlFor="curriculum-title">Schedule Title</Label>
          <Input
            id="curriculum-title"
            value={schedule.title}
            onChange={(e) => updateField("title", e.target.value)}
            placeholder="6-Month Curriculum Schedule"
            data-testid="input-curriculum-title"
          />
        </div>
        <div>
          <Label htmlFor="curriculum-desc">Description</Label>
          <Textarea
            id="curriculum-desc"
            value={schedule.description}
            onChange={(e) => updateField("description", e.target.value)}
            placeholder="Comprehensive coverage of all subjects..."
            rows={2}
            data-testid="input-curriculum-desc"
          />
        </div>
      </div>

      <div className="flex items-center justify-between pt-4">
        <Label>Months</Label>
        <Button type="button" variant="outline" size="sm" onClick={addMonth} data-testid="button-add-month">
          <Plus className="w-4 h-4 mr-1" /> Add Month
        </Button>
      </div>

      {schedule.months.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center text-muted-foreground">
            No months added yet. Click "Add Month" to create curriculum.
          </CardContent>
        </Card>
      ) : (
        <Accordion type="multiple" className="space-y-2">
          {schedule.months.map((month, monthIndex) => (
            <AccordionItem key={monthIndex} value={`month-${monthIndex}`} className="border rounded-lg">
              <AccordionTrigger className="px-4 hover:no-underline">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-primary" />
                  <span>Month {month.monthNumber}</span>
                  <span className="text-xs text-muted-foreground">
                    ({month.subjects.length} subjects, {month.details.length} lectures)
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                <div className="space-y-4">
                  <div>
                    <Label>Subjects (comma-separated)</Label>
                    <Input
                      value={month.subjects.join(", ")}
                      onChange={(e) => updateMonth(monthIndex, "subjects", e.target.value.split(",").map(s => s.trim()).filter(Boolean))}
                      placeholder="PSM, Pharmacology, Orthopedics"
                      data-testid={`input-subjects-${monthIndex}`}
                    />
                  </div>

                  <div>
                    <Label>Holiday/Break</Label>
                    <Input
                      value={month.holiday || ""}
                      onChange={(e) => updateMonth(monthIndex, "holiday", e.target.value)}
                      placeholder="Holiday: 2-3 Days Festival/Weekend Break"
                      data-testid={`input-holiday-${monthIndex}`}
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Lectures/Sessions</Label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => addDetail(monthIndex)}
                        data-testid={`button-add-detail-${monthIndex}`}
                      >
                        <Plus className="w-4 h-4 mr-1" /> Add Lecture
                      </Button>
                    </div>

                    {month.details.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-2">
                        No lectures added. Add sessions for this month.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {month.details.map((detail, detailIndex) => (
                          <Card key={detailIndex} className="p-3">
                            <div className="grid grid-cols-3 gap-2">
                              <Input
                                value={detail.title}
                                onChange={(e) => updateDetail(monthIndex, detailIndex, "title", e.target.value)}
                                placeholder="Subject – Faculty"
                                data-testid={`input-detail-title-${monthIndex}-${detailIndex}`}
                              />
                              <Input
                                value={detail.duration || ""}
                                onChange={(e) => updateDetail(monthIndex, detailIndex, "duration", e.target.value)}
                                placeholder="4 Days"
                                data-testid={`input-detail-duration-${monthIndex}-${detailIndex}`}
                              />
                              <div className="flex gap-2">
                                <Input
                                  value={detail.test || ""}
                                  onChange={(e) => updateDetail(monthIndex, detailIndex, "test", e.target.value)}
                                  placeholder="Test info"
                                  className="flex-1"
                                  data-testid={`input-detail-test-${monthIndex}-${detailIndex}`}
                                />
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => removeDetail(monthIndex, detailIndex)}
                                  data-testid={`button-remove-detail-${monthIndex}-${detailIndex}`}
                                >
                                  <Trash2 className="w-4 h-4 text-destructive" />
                                </Button>
                              </div>
                            </div>
                          </Card>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2 border-t pt-4">
                    <Label>Cumulative Test (optional)</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        value={month.cumulative?.title || ""}
                        onChange={(e) => updateCumulative(monthIndex, "title", e.target.value)}
                        placeholder="Cumulative I"
                        data-testid={`input-cumulative-title-${monthIndex}`}
                      />
                      <Input
                        value={month.cumulative?.description || ""}
                        onChange={(e) => updateCumulative(monthIndex, "description", e.target.value)}
                        placeholder="Subjects covered | 1 Day, 4 PM"
                        data-testid={`input-cumulative-desc-${monthIndex}`}
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => removeMonth(monthIndex)}
                      data-testid={`button-remove-month-${monthIndex}`}
                    >
                      <Trash2 className="w-4 h-4 mr-1" /> Remove Month
                    </Button>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}

      <div className="border-t pt-4 space-y-4">
        <Label className="text-sm font-medium">Summary (optional)</Label>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="summary-subjects">Total Subjects</Label>
            <Input
              id="summary-subjects"
              type="number"
              value={schedule.summary?.totalSubjects || ""}
              onChange={(e) => updateField("summary", { 
                ...schedule.summary, 
                totalSubjects: parseInt(e.target.value) || 0 
              })}
              placeholder="19"
              data-testid="input-summary-subjects"
            />
          </div>
          <div>
            <Label htmlFor="summary-duration">Duration</Label>
            <Input
              id="summary-duration"
              value={schedule.summary?.duration || ""}
              onChange={(e) => updateField("summary", { 
                ...schedule.summary, 
                duration: e.target.value 
              })}
              placeholder="6 Months"
              data-testid="input-summary-duration"
            />
          </div>
        </div>
        <div>
          <Label htmlFor="summary-desc">Summary Description</Label>
          <Input
            id="summary-desc"
            value={schedule.summary?.description || ""}
            onChange={(e) => updateField("summary", { 
              ...schedule.summary, 
              description: e.target.value 
            })}
            placeholder="Covers all subjects with regular tests..."
            data-testid="input-summary-desc"
          />
        </div>
      </div>
    </div>
  );
}
