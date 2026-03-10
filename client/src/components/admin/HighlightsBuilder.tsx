import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Plus, Trash2, GripVertical } from "lucide-react";
import type { ProgramHighlightTab, ProgramHighlightItem } from "@shared/schema";

const ICON_OPTIONS = [
  { value: "BookOpen", label: "Book Open (Academic)" },
  { value: "FileText", label: "File Text (Resources)" },
  { value: "BarChart3", label: "Bar Chart (Assessment)" },
  { value: "HeartHandshake", label: "Heart Handshake (Support)" },
  { value: "Award", label: "Award (Benefits)" },
  { value: "Clock", label: "Clock (Schedule)" },
  { value: "Users", label: "Users (Community)" },
  { value: "GraduationCap", label: "Graduation Cap (Education)" },
  { value: "Library", label: "Library (Study)" },
  { value: "Target", label: "Target (Goals)" },
];

const DEFAULT_TAB: ProgramHighlightTab = {
  id: "",
  title: "",
  icon: "BookOpen",
  heading: "",
  items: [],
};

const DEFAULT_ITEM: ProgramHighlightItem = {
  label: "",
  description: "",
};

interface HighlightsBuilderProps {
  value: ProgramHighlightTab[];
  onChange: (tabs: ProgramHighlightTab[]) => void;
}

export function HighlightsBuilder({ value, onChange }: HighlightsBuilderProps) {
  const tabs = value || [];

  const addTab = () => {
    const newId = `tab-${Date.now()}`;
    onChange([...tabs, { ...DEFAULT_TAB, id: newId }]);
  };

  const removeTab = (index: number) => {
    onChange(tabs.filter((_, i) => i !== index));
  };

  const updateTab = (index: number, field: keyof ProgramHighlightTab, fieldValue: any) => {
    const updated = [...tabs];
    updated[index] = { ...updated[index], [field]: fieldValue };
    onChange(updated);
  };

  const addItem = (tabIndex: number) => {
    const updated = [...tabs];
    updated[tabIndex] = {
      ...updated[tabIndex],
      items: [...updated[tabIndex].items, { ...DEFAULT_ITEM }],
    };
    onChange(updated);
  };

  const removeItem = (tabIndex: number, itemIndex: number) => {
    const updated = [...tabs];
    updated[tabIndex] = {
      ...updated[tabIndex],
      items: updated[tabIndex].items.filter((_, i) => i !== itemIndex),
    };
    onChange(updated);
  };

  const updateItem = (tabIndex: number, itemIndex: number, field: keyof ProgramHighlightItem, fieldValue: string) => {
    const updated = [...tabs];
    updated[tabIndex] = {
      ...updated[tabIndex],
      items: updated[tabIndex].items.map((item, i) =>
        i === itemIndex ? { ...item, [field]: fieldValue } : item
      ),
    };
    onChange(updated);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="text-base font-semibold">Program Highlights Tabs</Label>
        <Button type="button" variant="outline" size="sm" onClick={addTab} data-testid="button-add-tab">
          <Plus className="w-4 h-4 mr-1" /> Add Tab
        </Button>
      </div>

      {tabs.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center text-muted-foreground">
            No highlight tabs yet. Click "Add Tab" to create one.
          </CardContent>
        </Card>
      ) : (
        <Accordion type="multiple" className="space-y-2">
          {tabs.map((tab, tabIndex) => (
            <AccordionItem key={tab.id || tabIndex} value={`tab-${tabIndex}`} className="border rounded-lg">
              <AccordionTrigger className="px-4 hover:no-underline">
                <div className="flex items-center gap-2">
                  <GripVertical className="w-4 h-4 text-muted-foreground" />
                  <span>{tab.title || `Tab ${tabIndex + 1}`}</span>
                  <span className="text-xs text-muted-foreground">({tab.items.length} items)</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor={`tab-id-${tabIndex}`}>Tab ID</Label>
                      <Input
                        id={`tab-id-${tabIndex}`}
                        value={tab.id}
                        onChange={(e) => updateTab(tabIndex, "id", e.target.value)}
                        placeholder="academic"
                        data-testid={`input-tab-id-${tabIndex}`}
                      />
                    </div>
                    <div>
                      <Label htmlFor={`tab-title-${tabIndex}`}>Tab Title</Label>
                      <Input
                        id={`tab-title-${tabIndex}`}
                        value={tab.title}
                        onChange={(e) => updateTab(tabIndex, "title", e.target.value)}
                        placeholder="Academic"
                        data-testid={`input-tab-title-${tabIndex}`}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor={`tab-icon-${tabIndex}`}>Icon</Label>
                      <Select
                        value={tab.icon}
                        onValueChange={(v) => updateTab(tabIndex, "icon", v)}
                      >
                        <SelectTrigger id={`tab-icon-${tabIndex}`} data-testid={`select-tab-icon-${tabIndex}`}>
                          <SelectValue placeholder="Select icon" />
                        </SelectTrigger>
                        <SelectContent>
                          {ICON_OPTIONS.map((icon) => (
                            <SelectItem key={icon.value} value={icon.value}>
                              {icon.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor={`tab-heading-${tabIndex}`}>Heading</Label>
                      <Input
                        id={`tab-heading-${tabIndex}`}
                        value={tab.heading}
                        onChange={(e) => updateTab(tabIndex, "heading", e.target.value)}
                        placeholder="Academic Environment"
                        data-testid={`input-tab-heading-${tabIndex}`}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Features/Items</Label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => addItem(tabIndex)}
                        data-testid={`button-add-item-${tabIndex}`}
                      >
                        <Plus className="w-4 h-4 mr-1" /> Add Item
                      </Button>
                    </div>

                    {tab.items.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-2">
                        No items yet. Add features for this tab.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {tab.items.map((item, itemIndex) => (
                          <Card key={itemIndex} className="p-3">
                            <div className="flex gap-2">
                              <div className="flex-1 grid grid-cols-2 gap-2">
                                <Input
                                  value={item.label}
                                  onChange={(e) => updateItem(tabIndex, itemIndex, "label", e.target.value)}
                                  placeholder="Feature label"
                                  data-testid={`input-item-label-${tabIndex}-${itemIndex}`}
                                />
                                <Input
                                  value={item.description}
                                  onChange={(e) => updateItem(tabIndex, itemIndex, "description", e.target.value)}
                                  placeholder="Feature description"
                                  data-testid={`input-item-desc-${tabIndex}-${itemIndex}`}
                                />
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => removeItem(tabIndex, itemIndex)}
                                data-testid={`button-remove-item-${tabIndex}-${itemIndex}`}
                              >
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            </div>
                          </Card>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end pt-2">
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => removeTab(tabIndex)}
                      data-testid={`button-remove-tab-${tabIndex}`}
                    >
                      <Trash2 className="w-4 h-4 mr-1" /> Remove Tab
                    </Button>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </div>
  );
}
