"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function SaveEstimateDialog({
  open,
  onOpenChange,
  disabled,
  pending,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disabled: boolean;
  pending: boolean;
  onSave: (name: string, client: string) => void;
}) {
  const [name, setName] = useState("");
  const [client, setClient] = useState("");

  function handleOpenChange(next: boolean) {
    if (!next) {
      setName("");
      setClient("");
    }
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button className="w-full rounded-sm" disabled={disabled}>
          Save estimate
        </Button>
      </DialogTrigger>
      <DialogContent className="border-rule bg-leaf sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl">Save estimate</DialogTitle>
          <DialogDescription className="annot">
            Saving copies today&apos;s formulas and values. Later parameter edits will not move these numbers.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="estimate-name" className="eyebrow">
              Name
            </Label>
            <Input
              id="estimate-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1.5 bg-paper"
            />
          </div>
          <div>
            <Label htmlFor="estimate-client" className="eyebrow">
              Client
            </Label>
            <Input
              id="estimate-client"
              value={client}
              onChange={(e) => setClient(e.target.value)}
              className="mt-1.5 bg-paper"
            />
          </div>
        </div>
        <DialogFooter>
          <Button className="rounded-sm" onClick={() => onSave(name, client)} disabled={pending}>
            Save estimate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
