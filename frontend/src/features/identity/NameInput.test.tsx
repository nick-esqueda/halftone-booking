import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { installFakeApi, respond } from "../../test/fakeApi";
import { renderWithProviders } from "../../test/renderWithProviders";
import { NameInput } from "./NameInput";

function NameField() {
  const [name, setName] = useState("");
  return <NameInput label="Your name" value={name} onChange={setName} />;
}

async function typeName(name: string) {
  installFakeApi({
    "GET /api/booker-names": () => respond(200, ["Ana Lopez", "Sam K"]),
  });
  renderWithProviders(<NameField />);
  const field = screen.getByLabelText("Your name");
  await userEvent.type(field, name);
  await userEvent.tab();
  return field;
}

describe("NameInput", () => {
  it("asks about a likely typo once the field is left, and fixes it", async () => {
    const field = await typeName("Sam Kk");

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Did you mean Sam K?",
    );
    await userEvent.click(screen.getByRole("button", { name: "Sam K" }));

    expect(field).toHaveValue("Sam K");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("says nothing for a new name unlike the others", async () => {
    await typeName("Priya Shah");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("says nothing while the name is being typed", async () => {
    installFakeApi({
      "GET /api/booker-names": () => respond(200, ["Sam K"]),
    });
    renderWithProviders(<NameField />);
    await userEvent.type(screen.getByLabelText("Your name"), "Sam Kk");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
