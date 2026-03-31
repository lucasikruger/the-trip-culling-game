/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    user: {
      email: string;
      is_admin: boolean;
      is_super_admin: boolean;
      display_name: string | null;
      avatar_url: string | null;
    } | null;
  }
}
