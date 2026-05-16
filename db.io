// ==========================================
// ENUMS (PostgreSQL Custom Types)
// ==========================================
Enum subscription_status {
  active
  canceled
  past_due
  trialing
}

Enum permission_level {
  viewer
  editor
  commenter // Added commenter role for granular access
}

Enum asset_type {
  image
  vector
  font
  audio
  other
}

// ==========================================
// TABLES
// ==========================================

Table users [note: 'Stores core application user profile data. Primary authentication is delegated to Auth0.'] {
  id uuid [primary key, default: `gen_random_uuid()`, note: 'Unique internal application identifier']
  auth0_subject varchar [unique, not null, note: 'The unique sub claim provided by the Auth0 JWT']
  email varchar [unique, not null, note: 'User email address, synced from Auth0 for local app communication']
  display_name varchar [note: 'Optional username or display name chosen by the user']
  created_at timestamptz [default: `now()`, note: 'Timestamp when the user profile was initialized in the DB']
  updated_at timestamptz [default: `now()`, note: 'Timestamp when the user profile was last updated']
}

Table subscriptions [note: 'Tracks the active Pro tier status and billing cycle limits for users.'] {
  id uuid [primary key, default: `gen_random_uuid()`, note: 'Unique identifier for the subscription record']
  user_id uuid [unique, not null, note: 'Foreign key to the owning user (1:1 relationship for active state)']
  status subscription_status [default: 'trialing', note: 'Current status of the subscription lifecycle']
  provider_sub_id varchar [unique, note: 'External subscription ID from the payment provider (e.g., Stripe)']
  current_period_end timestamptz [note: 'The date and time when the current billed period expires']
  created_at timestamptz [default: `now()`, note: 'Timestamp when the subscription was originally created']
  updated_at timestamptz [default: `now()`, note: 'Timestamp when the subscription data was last synced']
}

Table payments [note: 'Immutable audit log of individual payment transactions for invoicing and dispute handling.'] {
  id uuid [primary key, default: `gen_random_uuid()`, note: 'Unique identifier for the payment record']
  user_id uuid [not null, note: 'Foreign key to the user who made the payment']
  subscription_id uuid [note: 'Foreign key linking payment to a specific subscription term']
  amount decimal(10,2) [not null, note: 'Monetary amount charged, utilizing decimal to prevent floating point errors']
  currency varchar(3) [default: 'USD', note: 'ISO 4217 three-letter currency code']
  provider_tx_id varchar [unique, not null, note: 'External transaction ID from the payment provider']
  created_at timestamptz [default: `now()`, note: 'Immutable timestamp of when the transaction occurred']
}

Table projects [note: 'Core entity representing uploaded or created image projects, storing storage pointers and metadata.'] {
  id uuid [primary key, default: `gen_random_uuid()`, note: 'Unique project identifier used in API routes']
  owner_id uuid [not null, note: 'Foreign key to the user who originally created/uploaded the project']
  project_name varchar [not null, note: 'Human-readable display name of the image project']
  storage_key varchar [not null, note: 'The exact path/key in the object storage bucket (e.g., AWS S3)']
  size_bytes bigint [not null, note: 'Project size in bytes, bigint prevents overflow for massive raw projects']
  mime_type varchar [default: 'image/png', note: 'MIME type of the project for content negotiation']
  metadata jsonb [note: 'Flexible JSONB column for editing-specific data (resolution, layers, filter history)']
  is_deleted boolean [default: false, note: 'Soft-delete flag to allow recovery from trash']
  created_at timestamptz [default: `now()`, note: 'Timestamp of initial project creation']
  updated_at timestamptz [default: `now()`, note: 'Timestamp of the last modification to the project or its metadata']
}

Table project_assets [note: 'Stores individual reusable media elements (images, vectors, fonts) uploaded directly inside a project.'] {
  id uuid [primary key, default: `gen_random_uuid()`, note: 'Unique identifier for the asset']
  project_id uuid [not null, note: 'Foreign key to the parent project this asset belongs to']
  uploaded_by uuid [not null, note: 'Foreign key to the user who uploaded this specific asset']
  asset_name varchar [not null, note: 'Original or user-defined display name of the asset']
  type asset_type [default: 'image', note: 'Categorization of the asset (image, vector, font) for frontend filtering']
  storage_key varchar [not null, note: 'The specific path/key in the storage bucket for this individual file']
  size_bytes bigint [not null, note: 'Size of the isolated asset in bytes']
  mime_type varchar [note: 'MIME type of the asset (e.g., image/jpeg, font/woff2)']
  created_at timestamptz [default: `now()`, note: 'Timestamp when the asset was added to the project']
}

Table project_snapshots [note: 'Immutable point-in-time backups or explicit versions of a project state.'] {
  id uuid [primary key, default: `gen_random_uuid()`, note: 'Unique identifier for the snapshot version']
  project_id uuid [not null, note: 'Foreign key to the project being backed up']
  created_by uuid [not null, note: 'Foreign key to the user who explicitly triggered or auto-saved the snapshot']
  snapshot_name varchar [note: 'Optional human-readable tag (e.g., "Final v1", "Before dark mode")']
  state_data jsonb [note: 'The complete JSON representation of the project layers/metadata at this exact moment in time']
  thumbnail_storage_key varchar [note: 'Optional storage path to a flattened preview image of this specific snapshot']
  created_at timestamptz [default: `now()`, note: 'Immutable timestamp of when the backup was captured']
}

Table project_accesses [note: 'Junction table managing the Access Control List (ACL) for sharing projects between users.'] {
  id uuid [primary key, default: `gen_random_uuid()`, note: 'Unique identifier for the access grant rule']
  project_id uuid [not null, note: 'Foreign key to the shared project']
  shared_with_user_id uuid [note: 'Foreign key to the user granted access. If NULL, it signifies a public link']
  permission permission_level [default: 'viewer', note: 'The specific CRUD privileges granted to the user']
  expires_at timestamptz [note: 'Optional timestamp for time-limited shares (e.g., expires in 7 days)']
  created_by uuid [not null, note: 'Foreign key tracking which user created this specific access grant']
  created_at timestamptz [default: `now()`, note: 'Timestamp when the access rule was created']
}

Table project_comments [note: 'Stores spatial and threaded comments left on image projects for collaboration.'] {
  id uuid [primary key, default: `gen_random_uuid()`, note: 'Unique identifier for the comment']
  project_id uuid [not null, note: 'Foreign key to the project being commented on']
  parent_comment_id uuid [note: 'Self-referencing foreign key for threaded replies. Null if this is a top-level comment.']
  user_id uuid [not null, note: 'Foreign key to the user who authored the comment']
  content text [not null, note: 'The actual text body of the comment']
  x_coordinate decimal(8,4) [note: 'X-axis position for spatial pins on the image (usually stored as a percentage to handle zooming/resizing)']
  y_coordinate decimal(8,4) [note: 'Y-axis position for spatial pins on the image']
  is_resolved boolean [default: false, note: 'Flag indicating if the feedback workflow was addressed/closed']
  resolved_at timestamptz [note: 'Timestamp of when the comment was marked resolved']
  resolved_by uuid [note: 'Foreign key to the user who resolved the comment thread']
  is_deleted boolean [default: false, note: 'Soft-delete flag to hide removed comments without breaking audit trails']
  created_at timestamptz [default: `now()`, note: 'Timestamp of initial comment creation']
  updated_at timestamptz [default: `now()`, note: 'Timestamp of last edit to the comment text']
}

// ==========================================
// RELATIONSHIPS (Foreign Keys)
// ==========================================

// Subscriptions & Payments
Ref: users.id < subscriptions.user_id
Ref: users.id < payments.user_id
Ref: subscriptions.id < payments.subscription_id

// Projects & Access
Ref: users.id < projects.owner_id
Ref: projects.id < project_accesses.project_id
Ref: users.id < project_accesses.shared_with_user_id
Ref: users.id < project_accesses.created_by

// Assets & Snapshots (New)
Ref: projects.id < project_assets.project_id
Ref: users.id < project_assets.uploaded_by
Ref: projects.id < project_snapshots.project_id
Ref: users.id < project_snapshots.created_by

// Comments
Ref: projects.id < project_comments.project_id
Ref: users.id < project_comments.user_id
Ref: project_comments.id < project_comments.parent_comment_id // Threading logic
Ref: users.id < project_comments.resolved_by