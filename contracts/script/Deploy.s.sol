// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {Registry} from "../src/Registry.sol";

/// @notice Deploys the Registry with the demo min root interval (60 s; SPEC §9 uses 15 min in production) and
///         registers the issuer. Broadcast with the authority key, since addIssuer is authority-only:
///   forge script script/Deploy.s.sol:Deploy --rpc-url sepolia --private-key 0x$AUTHORITY_PRIVATE_KEY \
///     --broadcast --verify
/// Requires env: AUTHORITY_ADDRESS (must equal the broadcaster), ISSUER_ADDRESS, optional MIN_ROOT_INTERVAL.
contract Deploy is Script {
    function run() external returns (Registry registry) {
        address authority = vm.envAddress("AUTHORITY_ADDRESS");
        address issuer = vm.envAddress("ISSUER_ADDRESS");
        uint64 minRootInterval = uint64(vm.envOr("MIN_ROOT_INTERVAL", uint256(60)));

        vm.startBroadcast();
        registry = new Registry(authority, minRootInterval);
        registry.addIssuer(issuer);
        vm.stopBroadcast();

        console.log("registry:", address(registry));
        console.log("authority:", authority);
        console.log("issuer:", issuer);
        console.log("minRootInterval:", minRootInterval);
    }
}
