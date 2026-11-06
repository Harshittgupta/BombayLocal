pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

// The scanner is its own Gradle project (rule R4): it never depends on apps/passenger.
rootProject.name = "unlink-scanner"
include(":verifier")
include(":app")
