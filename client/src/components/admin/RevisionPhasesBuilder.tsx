import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Plus, Trash2, RotateCcw } from "lucide-react";
import type { RevisionPhases, RevisionPhase } from "@shared/schema";

const DEFAULT_PHASE: RevisionPhase = {
  id: "",
  badge: "",
  title: "",
  duration: "",
  description: "",
  features: [],
};

interface RevisionPhasesBuilderProps {
  value: RevisionPhases | null;
  onChange: (phases: RevisionPhases | null) => void;
}

export function RevisionPhasesBuilder({ value, onChange }: RevisionPhasesBuilderProps) {
  const data = value || {
    title: "",
    intro: "",
    phases: [],
    grandTests: { description: "", features: [] },
  };

  const updateField = (field: keyof RevisionPhases, fieldValue: any) => {
    onChange({ ...data, [field]: fieldValue });
  };

  const addPhase = () => {
    const nextNum = data.phases.length + 1;
    onChange({
      ...data,
      phases: [...data.phases, { 
        ...DEFAULT_PHASE, 
        id: `r${nextNum}`,
        badge: `R${nextNum}`,
        title: `Phase ${nextNum} Revision`,
      }],
    });
  };

  const removePhase = (index: number) => {
    onChange({
      ...data,
      phases: data.phases.filter((_, i) => i !== index),
    });
  };

  const updatePhase = (index: number, field: keyof RevisionPhase, fieldValue: any) => {
    const updated = [...data.phases];
    updated[index] = { ...updated[index], [field]: fieldValue };
    onChange({ ...data, phases: updated });
  };

  const updateGrandTests = (field: "description" | "features", fieldValue: any) => {
    onChange({
      ...data,
      grandTests: {
        ...data.grandTests,
        description: data.grandTests?.description || "",
        features: data.grandTests?.features || [],
        [field]: fieldValue,
      },
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="text-base font-semibold">Revision Phases</Label>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <div>
          <Label htmlFor="revision-title">Title</Label>
          <Input
            id="revision-title"
            value={data.title}
            onChange={(e) => updateField("title", e.target.value)}
            placeholder="Phase 2: Revision Cycle (5 Months)"
            data-testid="input-revision-title"
          />
        </div>
        <div>
          <Label htmlFor="revision-intro">Introduction</Label>
          <Textarea
            id="revision-intro"
            value={data.intro}
            onChange={(e) => updateField("intro", e.target.value)}
            placeholder="The revision phase is designed to reinforce learning..."
            rows={3}
            data-testid="input-revision-intro"
          />
        </div>
      </div>

      <div className="flex items-center justify-between pt-4">
        <Label>Phases</Label>
        <Button type="button" variant="outline" size="sm" onClick={addPhase} data-testid="button-add-phase">
          <Plus className="w-4 h-4 mr-1" /> Add Phase
        </Button>
      </div>

      {data.phases.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center text-muted-foreground">
            No phases added yet. Click "Add Phase" to create revision phases.
          </CardContent>
        </Card>
      ) : (
        <Accordion type="multiple" className="space-y-2">
          {data.phases.map((phase, phaseIndex) => (
            <AccordionItem key={phase.id || phaseIndex} value={`phase-${phaseIndex}`} className="border rounded-lg">
              <AccordionTrigger className="px-4 hover:no-underline">
                <div className="flex items-center gap-2">
                  <RotateCcw className="w-4 h-4 text-primary" />
                  <span className="font-medium">{phase.badge}</span>
                  <span>{phase.title || `Phase ${phaseIndex + 1}`}</span>
                  <span className="text-xs text-muted-foreground">
                    ({phase.duration || "No duration"})
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label>ID</Label>
                      <Input
                        value={phase.id}
                        onChange={(e) => updatePhase(phaseIndex, "id", e.target.value)}
                        placeholder="r1"
                        data-testid={`input-phase-id-${phaseIndex}`}
                      />
                    </div>
                    <div>
                      <Label>Badge</Label>
                      <Input
                        value={phase.badge}
                        onChange={(e) => updatePhase(phaseIndex, "badge", e.target.value)}
                        placeholder="R1"
                        data-testid={`input-phase-badge-${phaseIndex}`}
                      />
                    </div>
                    <div>
                      <Label>Duration</Label>
                      <Input
                        value={phase.duration}
                        onChange={(e) => updatePhase(phaseIndex, "duration", e.target.value)}
                        placeholder="~3 Months"
                        data-testid={`input-phase-duration-${phaseIndex}`}
                      />
                    </div>
                  </div>

                  <div>
                    <Label>Title</Label>
                    <Input
                      value={phase.title}
                      onChange={(e) => updatePhase(phaseIndex, "title", e.target.value)}
                      placeholder="Phase 1 Revision"
                      data-testid={`input-phase-title-${phaseIndex}`}
                    />
                  </div>

                  <div>
                    <Label>Description</Label>
                    <Input
                      value={phase.description}
                      onChange={(e) => updatePhase(phaseIndex, "description", e.target.value)}
                      placeholder="Half the duration of original teaching period per subject"
                      data-testid={`input-phase-desc-${phaseIndex}`}
                    />
                  </div>

                  <div>
                    <Label>Features (one per line)</Label>
                    <Textarea
                      value={phase.features.join("\n")}
                      onChange={(e) => updatePhase(phaseIndex, "features", e.target.value.split("\n").filter(Boolean))}
                      placeholder="Rapid recap of all 19 subjects&#10;Test & Discussion sessions after each subject&#10;Topic-wise revision discussions with faculty"
                      rows={4}
                      data-testid={`input-phase-features-${phaseIndex}`}
                    />
                  </div>

                  <div className="flex justify-end pt-2">
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => removePhase(phaseIndex)}
                      data-testid={`button-remove-phase-${phaseIndex}`}
                    >
                      <Trash2 className="w-4 h-4 mr-1" /> Remove Phase
                    </Button>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}

      <div className="border-t pt-4 space-y-4">
        <Label className="text-sm font-medium">Grand Tests (optional)</Label>
        <div>
          <Label htmlFor="grand-test-desc">Description</Label>
          <Input
            id="grand-test-desc"
            value={data.grandTests?.description || ""}
            onChange={(e) => updateGrandTests("description", e.target.value)}
            placeholder="Full-length mock exams simulating actual NEET-PG/INI-CET pattern"
            data-testid="input-grand-test-desc"
          />
        </div>
        <div>
          <Label htmlFor="grand-test-features">Features (one per line)</Label>
          <Textarea
            id="grand-test-features"
            value={data.grandTests?.features?.join("\n") || ""}
            onChange={(e) => updateGrandTests("features", e.target.value.split("\n").filter(Boolean))}
            placeholder="200 questions in 3.5 hours&#10;Conducted every 8–10 days throughout revision phase&#10;Detailed performance analysis"
            rows={4}
            data-testid="input-grand-test-features"
          />
        </div>
      </div>
    </div>
  );
}
