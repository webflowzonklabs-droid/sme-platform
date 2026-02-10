import { defineModule } from "../registry";
import { notesRouter } from "./router";

// ============================================
// Notes Module — example/demo module
// Proves the module system works end-to-end
// ============================================

export const notesModule = defineModule({
  id: "notes",
  name: "Notes",
  version: "1.0.0",
  description: "Simple notes module — example/demo module for the platform",
  dependencies: [],

  permissions: [
    "notes:notes:read",
    "notes:notes:write",
    "notes:notes:delete",
  ],

  roleDefaults: {
    owner: ["notes:*"],
    admin: ["notes:*"],
    manager: ["notes:notes:read", "notes:notes:write"],
    operator: ["notes:notes:read", "notes:notes:write"],
    viewer: ["notes:notes:read"],
  },

  navigation: [
    {
      label: "Notes",
      icon: "StickyNote",
      href: "/notes",
      permission: "notes:notes:read",
    },
  ],

  router: notesRouter,
});

export { notesRouter } from "./router";
export { notes, type Note, type NewNote } from "./schema";
