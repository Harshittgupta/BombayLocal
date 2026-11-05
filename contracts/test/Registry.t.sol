// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Registry} from "../src/Registry.sol";

contract RegistryTest is Test {
    Registry internal reg;

    address internal authority = makeAddr("authority");
    address internal issuerA = makeAddr("issuerA");
    address internal issuerB = makeAddr("issuerB");
    address internal stranger = makeAddr("stranger");

    uint64 internal constant INTERVAL = 60;
    bytes32 internal constant ROOT1 = bytes32(uint256(1));
    bytes32 internal constant ROOT2 = bytes32(uint256(2));

    event IssuerAdded(address indexed issuer);
    event IssuerSuspended(address indexed issuer);
    event RootPosted(address indexed issuer, uint64 indexed rootId, bytes32 root, uint64 postedAt);
    event FloorRaised(address indexed issuer, uint64 oldFloor, uint64 newFloor);

    function setUp() public {
        vm.warp(1_793_000_000); // a realistic, nonzero clock
        vm.prank(authority);
        reg = new Registry(authority, INTERVAL);
    }

    function _add(address issuer) internal {
        vm.prank(authority);
        reg.addIssuer(issuer);
    }

    // ---- constructor ----

    function test_constructor_setsImmutables() public view {
        assertEq(reg.authority(), authority);
        assertEq(reg.minRootInterval(), INTERVAL);
        assertEq(reg.rootCount(), 0);
        assertEq(reg.issuers().length, 0);
    }

    // ---- access control on all three authority functions ----

    function test_addIssuer_onlyAuthority() public {
        vm.prank(stranger);
        vm.expectRevert(Registry.NotAuthority.selector);
        reg.addIssuer(issuerA);
    }

    function test_suspendIssuer_onlyAuthority() public {
        _add(issuerA);
        vm.prank(stranger);
        vm.expectRevert(Registry.NotAuthority.selector);
        reg.suspendIssuer(issuerA);
    }

    function test_setMinRootId_onlyAuthority() public {
        _add(issuerA);
        vm.prank(stranger);
        vm.expectRevert(Registry.NotAuthority.selector);
        reg.setMinRootId(issuerA, 1);
    }

    // ---- addIssuer ----

    function test_addIssuer_activatesAndLists() public {
        vm.expectEmit(true, false, false, false);
        emit IssuerAdded(issuerA);
        _add(issuerA);

        assertTrue(reg.isActive(issuerA));
        assertEq(reg.floor(issuerA), 0);
        address[] memory list = reg.issuers();
        assertEq(list.length, 1);
        assertEq(list[0], issuerA);
    }

    function test_addIssuer_revertsIfAlreadyActive() public {
        _add(issuerA);
        vm.prank(authority);
        vm.expectRevert(Registry.AlreadyActive.selector);
        reg.addIssuer(issuerA);
    }

    function test_addIssuer_revertsIfEverSuspended() public {
        _add(issuerA);
        vm.prank(authority);
        reg.suspendIssuer(issuerA);
        vm.prank(authority);
        vm.expectRevert(Registry.WasSuspended.selector);
        reg.addIssuer(issuerA); // re-add forbidden (SPEC v0.3 §8)
    }

    // ---- suspendIssuer ----

    function test_suspend_blocksPostingAndEmits() public {
        _add(issuerA);
        vm.expectEmit(true, false, false, false);
        emit IssuerSuspended(issuerA);
        vm.prank(authority);
        reg.suspendIssuer(issuerA);

        assertFalse(reg.isActive(issuerA));
        vm.prank(issuerA);
        vm.expectRevert(Registry.NotActiveIssuer.selector);
        reg.postRoot(ROOT1);
    }

    function test_suspend_revertsIfNotActive() public {
        vm.prank(authority);
        vm.expectRevert(Registry.NotActiveIssuer.selector);
        reg.suspendIssuer(issuerA);
    }

    // ---- postRoot ----

    function test_postRoot_onlyActiveIssuer() public {
        vm.prank(stranger);
        vm.expectRevert(Registry.NotActiveIssuer.selector);
        reg.postRoot(ROOT1);
    }

    function test_postRoot_rejectsZeroRoot() public {
        _add(issuerA);
        vm.prank(issuerA);
        vm.expectRevert(Registry.ZeroRoot.selector);
        reg.postRoot(bytes32(0));
    }

    function test_postRoot_firstPostStoresStateAndEmits() public {
        _add(issuerA);
        vm.expectEmit(true, true, false, true);
        emit RootPosted(issuerA, 1, ROOT1, uint64(block.timestamp));
        vm.prank(issuerA);
        uint64 id = reg.postRoot(ROOT1);
        assertEq(id, 1);

        (bool active, uint64 fl, bytes32 root, uint64 rootId, uint64 postedAt) = reg.issuerState(issuerA);
        assertTrue(active);
        assertEq(fl, 0);
        assertEq(root, ROOT1);
        assertEq(rootId, 1);
        assertEq(postedAt, uint64(block.timestamp));
        assertEq(reg.rootCount(), 1);
    }

    function test_rootId_strictlyIncreasesAcrossTwoIssuers() public {
        _add(issuerA);
        _add(issuerB);
        vm.prank(issuerA);
        assertEq(reg.postRoot(ROOT1), 1);
        vm.prank(issuerB);
        assertEq(reg.postRoot(ROOT1), 2); // global counter, not per-issuer
        skip(INTERVAL);
        vm.prank(issuerA);
        assertEq(reg.postRoot(ROOT2), 3);
        assertEq(reg.rootCount(), 3);
    }

    function test_postRoot_enforcesInterval() public {
        _add(issuerA);
        vm.prank(issuerA);
        reg.postRoot(ROOT1);

        vm.prank(issuerA);
        vm.expectRevert(Registry.TooSoon.selector);
        reg.postRoot(ROOT2);

        skip(INTERVAL - 1);
        vm.prank(issuerA);
        vm.expectRevert(Registry.TooSoon.selector);
        reg.postRoot(ROOT2);

        skip(1); // now exactly INTERVAL since the first post
        vm.prank(issuerA);
        assertEq(reg.postRoot(ROOT2), 2);
    }

    // ---- setMinRootId (per-issuer floor) ----

    function test_setFloor_raisesAndEmits() public {
        _add(issuerA);
        vm.prank(issuerA);
        reg.postRoot(ROOT1); // rootCount = 1

        vm.expectEmit(true, false, false, true);
        emit FloorRaised(issuerA, 0, 2);
        vm.prank(authority);
        reg.setMinRootId(issuerA, 2); // <= rootCount + 1
        assertEq(reg.floor(issuerA), 2);
    }

    function test_setFloor_cannotDecreaseOrStayEqual() public {
        _add(issuerA);
        vm.prank(authority);
        reg.setMinRootId(issuerA, 1);

        vm.prank(authority);
        vm.expectRevert(Registry.FloorOutOfRange.selector);
        reg.setMinRootId(issuerA, 1); // equal

        vm.prank(authority);
        vm.expectRevert(Registry.FloorOutOfRange.selector);
        reg.setMinRootId(issuerA, 0); // decrease
    }

    function test_setFloor_cannotExceedRootCountPlusOne() public {
        _add(issuerA); // rootCount = 0, so max floor is 1
        vm.prank(authority);
        vm.expectRevert(Registry.FloorOutOfRange.selector);
        reg.setMinRootId(issuerA, 2);

        vm.prank(authority);
        reg.setMinRootId(issuerA, 1); // exactly rootCount + 1 is allowed
        assertEq(reg.floor(issuerA), 1);
    }

    function test_setFloor_unknownIssuerReverts() public {
        vm.prank(authority);
        vm.expectRevert(Registry.UnknownIssuer.selector);
        reg.setMinRootId(stranger, 1);
    }

    function test_floorRaise_skipsIntervalForOneRepost() public {
        _add(issuerA);
        vm.prank(issuerA);
        reg.postRoot(ROOT1); // rootId 1, rootCount 1

        // Raise the floor above the latest root, stranding it.
        vm.prank(authority);
        reg.setMinRootId(issuerA, 2);

        // The issuer can repost immediately, without waiting the interval, to clear the floor.
        vm.prank(issuerA);
        uint64 id = reg.postRoot(ROOT2);
        assertEq(id, 2);
        assertGe(id, reg.floor(issuerA));

        // ...and the interval is enforced again afterwards.
        vm.prank(issuerA);
        vm.expectRevert(Registry.TooSoon.selector);
        reg.postRoot(ROOT1);
    }

    // ---- fuzz: global rootId ordering is a strict 1..n sequence regardless of timing ----

    function testFuzz_postRootOrdering(uint8 n, uint16[] calldata gaps) public {
        n = uint8(bound(n, 1, 40));
        _add(issuerA);
        _add(issuerB);
        uint64 expected = 0;
        for (uint256 i = 0; i < n; i++) {
            address who = (i % 2 == 0) ? issuerA : issuerB;
            // Always wait at least the interval so the post is allowed for either issuer.
            uint256 gap = INTERVAL + (gaps.length > 0 ? gaps[i % gaps.length] : 0);
            skip(gap);
            vm.prank(who);
            uint64 id = reg.postRoot(bytes32(uint256(i + 1)));
            assertEq(id, ++expected); // strictly increasing, no gaps
        }
        assertEq(reg.rootCount(), expected);
    }

    // ---- gas probe for SPEC §10 (steady-state postRoot) ----

    function test_gas_postRoot() public {
        _add(issuerA);
        vm.prank(issuerA);
        reg.postRoot(ROOT1); // first post (cold storage)
        skip(INTERVAL);
        vm.prank(issuerA);
        uint256 g0 = gasleft();
        reg.postRoot(ROOT2); // warm storage: the number we cite
        emit log_named_uint("postRoot warm gas", g0 - gasleft());
    }
}
