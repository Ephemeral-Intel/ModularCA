namespace ModularCA.Shared.Models.Management
{
    /// <summary>
    /// Body for the bulk user-group edit endpoint: the groups to add to and remove from a single user
    /// in one step-up-gated batch. Each privileged add/remove still spawns its own controlled-user
    /// ceremony; uncontrolled changes apply directly.
    /// </summary>
    public class BulkUserGroupsRequest
    {
        /// <summary>Group ids to add the user to (de-duped).</summary>
        public List<Guid> AddGroupIds { get; set; } = new();

        /// <summary>Group ids to remove the user from (de-duped).</summary>
        public List<Guid> RemoveGroupIds { get; set; } = new();
    }
}
