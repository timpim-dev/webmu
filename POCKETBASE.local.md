## 1. Update `webmuser` Collection
- **isPublic** (Type: Bool, Default: `true`)
- **publicKey** (Type: Text)
- **currentlyPlaying** (Type: Relation, Collection: `games`, Optional) - Stores the game currently being played.

## 2. Create `webmuGroups` Collection
- **Fields:**
  - **name** (Type: Text, Required)
  - **members** (Type: Relation, Multiple, Collection: `webmuser`)
  - **creator** (Type: Relation, Collection: `webmuser`)

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
  - **game** (Type: Relation, Collection: `games`, Optional) - For game-specific chat.
  - **encryptedData** (Type: Text)
  - **encryptedKey** (Type: Text)
  - **senderKey** (Type: Text)
  - **iv** (Type: Text)

## 5. Create `speedruns` Collection (New)
- **Fields:**
  - **user** (Type: Relation, Collection: `webmuser`, Required)
  - **game** (Type: Relation, Collection: `games`, Required)
  - **time** (Type: Number, Required) - Time in milliseconds.
  - **splitData** (Type: Text) - JSON representation of splits.
