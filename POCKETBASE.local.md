# PocketBase Schema Requirements (Updated for Encryption & Permissions)

To enable the User Stats and **End-to-End Encrypted Chat**, update your PocketBase schema as follows.

## 1. Update `webmuser` Collection
- **isPublic** (Type: Bool, Default: `true`)
- **publicKey** (Type: Text) - Stores the user's RSA-OAEP public key in JWK format.

## 2. Create `webmuGroups` Collection
- **Fields:**
  - **name** (Type: Text, Required)
  - **members** (Type: Relation, Multiple, Collection: `webmuser`)
  - **creator** (Type: Relation, Collection: `webmuser`)

- **API Rules:**
  - List/View: `members.id ?= @request.auth.id`
  - Create: `@request.auth.id != ""`
  - Update: `@request.auth.id = creator.id`
  - Delete: `@request.auth.id = creator.id`

## 3. Create `webmuGroupKeys` Collection (New)
*Stores the group's secret AES key, encrypted specifically for each member.*
- **Fields:**
  - **group** (Type: Relation, Collection: `webmuGroups`, Required)
  - **user** (Type: Relation, Collection: `webmuser`, Required)
  - **encryptedKey** (Type: Text, Required) - The Group AES key encrypted with the user's Public Key.

- **API Rules:**
  - List/View: `@request.auth.id = user.id`
  - Create: `@request.auth.id = group.creator.id`
  - Update: `@request.auth.id = group.creator.id`
  - Delete: `@request.auth.id = group.creator.id`

## 4. Create `webmuMessages` Collection
- **Fields:**
  - **sender** (Type: Relation, Collection: `webmuser`, Required)
  - **recipient** (Type: Relation, Collection: `webmuser`, Optional - for DMs)
  - **group** (Type: Relation, Collection: `webmuGroups`, Optional - for Groups)
  - **encryptedData** (Type: Text) - Stores the AES-GCM encrypted payload.
  - **encryptedKey** (Type: Text) - The AES key encrypted for the recipient (DMs only).
  - **senderKey** (Type: Text) - The AES key encrypted for the sender.
  - **iv** (Type: Text) - Initialization vector for AES-GCM encryption.

- **API Rules:**
  - List/View: `@request.auth.id = sender.id || @request.auth.id = recipient.id || group.members.id ?= @request.auth.id`
  - Create: `@request.auth.id = sender.id`
  - Update: `@request.auth.id = sender.id`
  - Delete: `@request.auth.id = sender.id || (group.id != "" && @request.auth.id = group.creator.id)`
