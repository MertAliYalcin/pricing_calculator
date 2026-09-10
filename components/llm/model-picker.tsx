"use client";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LLM_PROVIDERS, findLlmModel } from "@/lib/llm/models";

/** One leg of the blend: which model, and what it costs per million tokens. */
export function ModelPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (modelId: string) => void;
}) {
  const selected = findLlmModel(value);

  return (
    <div>
      <label className="eyebrow mb-2 block">{label}</label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-full rounded-sm border-rule bg-leaf">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="max-h-80">
          {LLM_PROVIDERS.map((provider) => (
            <SelectGroup key={provider.id}>
              <SelectLabel className="eyebrow">{provider.name}</SelectLabel>
              {provider.models.map((model) => (
                <SelectItem key={model.id} value={model.id}>
                  {model.name}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>

      {selected && (
        <div className="mt-2">
          <div className="figure text-xs text-graphite">
            in {selected.inputPricePerM.toFixed(2)} · out {selected.outputPricePerM.toFixed(2)} USD/M tokens
          </div>
          <div className="annot text-xs">
            {selected.provider.name}, retrieved {selected.provider.retrievedOn}
          </div>
        </div>
      )}
    </div>
  );
}
