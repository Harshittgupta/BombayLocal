// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Unlink Registry
/// @notice Neutral on-chain list of pass issuers and the metadata of each issuer's latest signed root
///         (SPEC v0.3 §7.1). The contract stores nothing per pass: only an issuer list, a global
///         monotonic root counter, and per-issuer {active, floor, latest root metadata}.
/// @dev No upgradeability and no owner transfer. The authority and the minimum root interval are immutable.
///      A suspended issuer can never be re-added, so roots signed in advance with a compromised key cannot
///      be revived (SPEC v0.3 §8, threat "Suspended issuer").
contract Registry {
    /// @param active            Whether the issuer may currently post roots.
    /// @param everSuspended     Set forever once suspended; blocks any re-add.
    /// @param floor             A signed root is honoured off-chain only if its rootId >= floor.
    /// @param latestRoot        The issuer's most recent root.
    /// @param latestRootId      Global id of that root.
    /// @param latestPostedAt    Block timestamp when it was posted.
    struct Issuer {
        bool active;
        bool everSuspended;
        uint64 floor;
        bytes32 latestRoot;
        uint64 latestRootId;
        uint64 latestPostedAt;
    }

    /// @notice The only account that can add/suspend issuers and raise floors (EOA for demo, multisig in prod).
    address public immutable authority;

    /// @notice Minimum seconds between an issuer's roots, enforced on-chain (SPEC §9 ROOT_INTERVAL).
    uint64 public immutable minRootInterval;

    uint64 private _rootCount; // global; rootIds start at 1
    address[] private _issuers; // every address ever added, in order
    mapping(address => Issuer) private _issuers_;

    error NotAuthority();
    error NotActiveIssuer();
    error AlreadyActive();
    error WasSuspended();
    error UnknownIssuer();
    error ZeroRoot();
    error TooSoon();
    error FloorOutOfRange();

    event IssuerAdded(address indexed issuer);
    event IssuerSuspended(address indexed issuer);
    event RootPosted(address indexed issuer, uint64 indexed rootId, bytes32 root, uint64 postedAt);
    event FloorRaised(address indexed issuer, uint64 oldFloor, uint64 newFloor);

    modifier onlyAuthority() {
        if (msg.sender != authority) revert NotAuthority();
        _;
    }

    /// @param authority_ The registry authority.
    /// @param minRootInterval_ Minimum seconds between an issuer's roots (demo deployment uses 60).
    constructor(address authority_, uint64 minRootInterval_) {
        authority = authority_;
        minRootInterval = minRootInterval_;
    }

    /// @notice Register a brand-new issuer with floor 0. Reverts if it is already active or was ever suspended.
    function addIssuer(address issuer) external onlyAuthority {
        Issuer storage s = _issuers_[issuer];
        if (s.active) revert AlreadyActive();
        if (s.everSuspended) revert WasSuspended();
        s.active = true;
        _issuers.push(issuer);
        emit IssuerAdded(issuer);
    }

    /// @notice Permanently suspend an active issuer. It can never be re-added.
    function suspendIssuer(address issuer) external onlyAuthority {
        Issuer storage s = _issuers_[issuer];
        if (!s.active) revert NotActiveIssuer();
        s.active = false;
        s.everSuspended = true;
        emit IssuerSuspended(issuer);
    }

    /// @notice Post a new tree root. Active issuer only; `root` must be nonzero; `rootId` is the global counter.
    /// @dev The minimum interval is enforced, except on the first post after a floor raise (latest root below
    ///      the floor), so a stranded issuer can immediately repost above its floor.
    function postRoot(bytes32 root) external returns (uint64 rootId) {
        Issuer storage s = _issuers_[msg.sender];
        if (!s.active) revert NotActiveIssuer();
        if (root == bytes32(0)) revert ZeroRoot();
        if (s.latestRootId >= s.floor) {
            if (block.timestamp < uint256(s.latestPostedAt) + minRootInterval) revert TooSoon();
        }
        rootId = ++_rootCount;
        s.latestRoot = root;
        s.latestRootId = rootId;
        s.latestPostedAt = uint64(block.timestamp);
        emit RootPosted(msg.sender, rootId, root, uint64(block.timestamp));
    }

    /// @notice Raise an issuer's floor to invalidate its roots below `newFloor`. The floor never decreases and
    ///         can be raised at most to rootCount()+1, so the issuer can always repost to clear it.
    function setMinRootId(address issuer, uint64 newFloor) external onlyAuthority {
        Issuer storage s = _issuers_[issuer];
        if (!s.active && !s.everSuspended) revert UnknownIssuer();
        uint64 old = s.floor;
        if (newFloor <= old || newFloor > _rootCount + 1) revert FloorOutOfRange();
        s.floor = newFloor;
        emit FloorRaised(issuer, old, newFloor);
    }

    /// @notice Whether an issuer may currently post.
    function isActive(address issuer) external view returns (bool) {
        return _issuers_[issuer].active;
    }

    /// @notice An issuer's current floor.
    function floor(address issuer) external view returns (uint64) {
        return _issuers_[issuer].floor;
    }

    /// @notice The global number of roots posted so far (equals the highest rootId).
    function rootCount() external view returns (uint64) {
        return _rootCount;
    }

    /// @notice Every address ever added, in order (suspended ones included; check `active`).
    function issuers() external view returns (address[] memory) {
        return _issuers;
    }

    /// @notice Everything an off-chain reader needs about one issuer in a single call (SPEC §3.1 refresh).
    function issuerState(address issuer)
        external
        view
        returns (bool active, uint64 floor_, bytes32 latestRoot, uint64 latestRootId, uint64 latestPostedAt)
    {
        Issuer storage s = _issuers_[issuer];
        return (s.active, s.floor, s.latestRoot, s.latestRootId, s.latestPostedAt);
    }
}
